import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { NutritionService } from "./nutrition.service";

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];

@Controller("nutrition")
export class NutritionController {
  constructor(private readonly nutritionService: NutritionService) {}

  @Post("photo")
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor("photo", {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_request, file, callback) => {
      if (!allowedImageTypes.includes(file.mimetype)) {
        callback(new BadRequestException("Choose a JPEG, PNG, or WebP food photo."), false);
        return;
      }
      callback(null, true);
    }
  }))
  analyzePhoto(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException("Choose a food photo to analyze.");
    return this.nutritionService.analyzePhoto(file);
  }

  @Get("barcode/:code")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  lookupBarcode(@Param("code") code: string) {
    return this.nutritionService.lookupBarcode(code);
  }
}
