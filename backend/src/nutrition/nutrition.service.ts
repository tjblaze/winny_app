import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";

export type NutritionFacts = {
  name: string;
  brand: string | null;
  servingSize: string;
  caloriesKcal: number | null;
  energyKj: number | null;
  proteinG: number | null;
  carbohydratesG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  source: "photo-estimate" | "barcode-label";
  confidence: "estimated" | "label";
  notes: string;
};

type OpenFoodFactsProduct = {
  product_name?: unknown;
  product_name_en?: unknown;
  brands?: unknown;
  quantity?: unknown;
  serving_size?: unknown;
  nutriments?: Record<string, unknown>;
};

type OpenFoodFactsResponse = { status?: unknown; product?: OpenFoodFactsProduct };

function optionalNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function rounded(value: number | null, digits = 1): number | null {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function productText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nutrient(nutrients: Record<string, unknown>, key: string): number | null {
  return optionalNumber(nutrients[key]);
}

@Injectable()
export class NutritionService {
  async analyzePhoto(file: Express.Multer.File): Promise<NutritionFacts> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        "Photo nutrition estimates are not configured. Set OPENAI_API_KEY on the API server."
      );
    }

    const model = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini";
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 500,
          response_format: { type: "json_object" },
          messages: [{
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "Estimate nutrition for the food visible in this image. Return one JSON object with exactly these fields:",
                  "name (short food or meal name), servingSize (estimated portion in grams or household measure), caloriesKcal, energyKj, proteinG, carbohydratesG, fatG, fiberG, sugarG, sodiumMg (number or null), notes (one short uncertainty note).",
                  "Estimate the visible serving, not per 100g. Use realistic nonnegative numbers. Convert kcal to kJ using 1 kcal = 4.184 kJ. If no food is clearly identifiable, return null for all nutrition numbers and explain in notes.",
                  "This is an approximate wellness estimate, not a medical or laboratory measurement."
                ].join(" ")
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
                  detail: "low"
                }
              }
            ]
          }]
        })
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new BadGatewayException("Photo analysis timed out. Please try again.");
      }
      throw new BadGatewayException("Could not connect to the photo nutrition service.");
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new ServiceUnavailableException("The photo nutrition service is not configured correctly.");
      }
      if (response.status === 429) {
        throw new BadGatewayException("The photo nutrition service is busy. Please try again shortly.");
      }
      throw new BadGatewayException("The photo nutrition service could not analyze this image.");
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new BadGatewayException("The photo nutrition service returned an invalid response.");
    }
    const content = this.getAssistantContent(payload);
    let estimate: unknown;
    try {
      estimate = JSON.parse(content) as unknown;
    } catch {
      throw new BadGatewayException("The photo nutrition service returned an invalid estimate.");
    }
    if (!estimate || typeof estimate !== "object" || Array.isArray(estimate)) {
      throw new BadGatewayException("The photo nutrition service returned an invalid estimate.");
    }

    const result = estimate as Record<string, unknown>;
    const caloriesKcal = this.validEstimate(result.caloriesKcal, 5000);
    const energyKj = this.validEstimate(result.energyKj, 20_920);
    if (caloriesKcal === null) {
      throw new BadGatewayException(
        productText(result.notes) ?? "Could not identify food clearly. Try another photo."
      );
    }

    return {
      name: productText(result.name) ?? "Food estimate",
      brand: null,
      servingSize: productText(result.servingSize) ?? "One visible serving",
      caloriesKcal: rounded(caloriesKcal, 0),
      energyKj: rounded(energyKj ?? caloriesKcal * 4.184, 0),
      proteinG: this.validEstimate(result.proteinG, 500),
      carbohydratesG: this.validEstimate(result.carbohydratesG, 1000),
      fatG: this.validEstimate(result.fatG, 500),
      fiberG: this.validEstimate(result.fiberG, 300),
      sugarG: this.validEstimate(result.sugarG, 1000),
      sodiumMg: this.validEstimate(result.sodiumMg, 20_000),
      source: "photo-estimate",
      confidence: "estimated",
      notes: productText(result.notes) ?? "Nutrition is an AI estimate based on the visible portion."
    };
  }

  async lookupBarcode(code: string): Promise<NutritionFacts> {
    const normalizedCode = code.trim();
    if (!/^\d{8,14}$/.test(normalizedCode)) {
      throw new BadRequestException("Enter a valid product barcode with 8 to 14 digits.");
    }

    let response: Response;
    try {
      response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(normalizedCode)}.json?fields=status,product_name,product_name_en,brands,quantity,serving_size,nutriments`,
        {
          headers: { "User-Agent": "SavorNutritionGuide/1.0 (food nutrition lookup)" },
          signal: AbortSignal.timeout(10_000)
        }
      );
    } catch {
      throw new BadGatewayException("Could not reach the product nutrition database.");
    }
    if (!response.ok) throw new BadGatewayException("The product nutrition database is unavailable.");

    let result: OpenFoodFactsResponse;
    try {
      result = await response.json() as OpenFoodFactsResponse;
    } catch {
      throw new BadGatewayException("The product nutrition database returned an invalid response.");
    }
    const product = result.product;
    if (result.status !== 1 || !product) {
      throw new NotFoundException("No food product was found for that barcode.");
    }
    const name = productText(product.product_name_en) ?? productText(product.product_name);
    if (!name) throw new NotFoundException("This barcode has no nutrition label in the product database.");

    const nutrients = product.nutriments;
    if (!nutrients) throw new NotFoundException("This product does not have nutrition details available.");

    const servingSize = productText(product.serving_size);
    const servingEnergyKcal = servingSize ? nutrient(nutrients, "energy-kcal_serving") : null;
    const servingEnergyKj = servingSize ? nutrient(nutrients, "energy-kj_serving") : null;
    const hasServingValues = servingEnergyKcal !== null || servingEnergyKj !== null;
    const energyKcal = hasServingValues
      ? servingEnergyKcal
      : nutrient(nutrients, "energy-kcal_100g");
    const energyKj = hasServingValues
      ? servingEnergyKj
      : nutrient(nutrients, "energy-kj_100g");
    const basis = hasServingValues ? "serving" : "100g";
    const sodium = nutrient(nutrients, `sodium_${basis}`);

    if (energyKcal === null && energyKj === null) {
      throw new NotFoundException("This product does not have calorie information available.");
    }
    const caloriesKcal = energyKcal ?? (energyKj === null ? null : energyKj / 4.184);
    const energyInKj = energyKj ?? (energyKcal === null ? null : energyKcal * 4.184);

    return {
      name,
      brand: productText(product.brands),
      servingSize: hasServingValues && servingSize ? servingSize : "Per 100 g",
      caloriesKcal: rounded(caloriesKcal, 0),
      energyKj: rounded(energyInKj, 0),
      proteinG: rounded(nutrient(nutrients, `proteins_${basis}`)),
      carbohydratesG: rounded(nutrient(nutrients, `carbohydrates_${basis}`)),
      fatG: rounded(nutrient(nutrients, `fat_${basis}`)),
      fiberG: rounded(nutrient(nutrients, `fiber_${basis}`)),
      sugarG: rounded(nutrient(nutrients, `sugars_${basis}`)),
      sodiumMg: rounded(sodium === null ? null : sodium * 1000, 0),
      source: "barcode-label",
      confidence: "label",
      notes: `Values are taken from the product label (${basis}). Product data provided by Open Food Facts.`
    };
  }

  private getAssistantContent(payload: unknown): string {
    if (!payload || typeof payload !== "object" || !("choices" in payload)) {
      throw new BadGatewayException("The photo nutrition service returned an invalid response.");
    }
    const choices = payload.choices;
    if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
      throw new BadGatewayException("The photo nutrition service returned an invalid response.");
    }
    const message = choices[0].message;
    if (!message || typeof message !== "object" || !("content" in message) || typeof message.content !== "string") {
      throw new BadGatewayException("The photo nutrition service returned an invalid response.");
    }
    return message.content;
  }

  private validEstimate(value: unknown, maximum: number): number | null {
    const number = optionalNumber(value);
    return number !== null && number <= maximum ? number : null;
  }
}
