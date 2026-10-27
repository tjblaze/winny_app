import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsBoolean,
  Equals,
  IsString,
  MinLength,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";

export class OrderLineDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateOrderDto {
  @IsBoolean()
  @Equals(true)
  demoPaymentConfirmed!: boolean;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  customerName!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(300)
  deliveryAddress!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items!: OrderLineDto[];
}
