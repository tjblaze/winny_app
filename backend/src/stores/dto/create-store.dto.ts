import { IsLatitude, IsLongitude, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { Type } from "class-transformer";

export class CreateStoreDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  tagline!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  cuisine!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  description!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  location!: string;

  @IsOptional()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: "Enter a WhatsApp number in international format, for example +14155552671."
  })
  whatsappNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;
}
