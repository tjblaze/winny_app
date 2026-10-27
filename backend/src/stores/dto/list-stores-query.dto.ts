import { Type } from "class-transformer";
import { IsLatitude, IsLongitude, ValidateIf } from "class-validator";

export class ListStoresQueryDto {
  @ValidateIf((input: ListStoresQueryDto) => input.longitude !== undefined)
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ValidateIf((input: ListStoresQueryDto) => input.latitude !== undefined)
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;
}
