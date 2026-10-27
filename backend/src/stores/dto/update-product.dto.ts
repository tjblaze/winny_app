import { Type } from "class-transformer";
import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength
} from "class-validator";

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10000)
  price?: number;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  category?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(https:\/\/\S+|\/uploads\/product-images\/[0-9a-f-]+\.(jpg|jpeg|png|webp))$/i)
  @MaxLength(500)
  image?: string;
}
