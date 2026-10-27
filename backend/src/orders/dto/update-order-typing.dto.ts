import { IsBoolean } from "class-validator";

export class UpdateOrderTypingDto {
  @IsBoolean()
  isTyping!: boolean;
}
