import { API_BASE } from "@/lib/api";
import { apiRequest } from "@/lib/api";

export function productImageUrl(image: string): string {
  if (!image.startsWith("/uploads/")) return image;
  return `${API_BASE.replace(/\/api\/?$/, "")}${image}`;
}

export async function uploadProductImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  const response = await apiRequest<{ image: string }>("/stores/me/products/image", {
    method: "POST",
    body: formData
  });
  return response.image;
}
