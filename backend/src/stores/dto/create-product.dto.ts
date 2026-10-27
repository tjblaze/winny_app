import { Type } from "class-transformer";
import {
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength
} from "class-validator";

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(300)
  description!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10000)
  price!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  category!: string;

  @IsString()
  @Matches(/^(https:\/\/\S+|\/uploads\/product-images\/[0-9a-f-]+\.(jpg|jpeg|png|webp))$/i)
  @MaxLength(500)
  image!: string;
}
