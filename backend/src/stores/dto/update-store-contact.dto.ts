import { IsOptional, Matches } from "class-validator";

export class UpdateStoreContactDto {
  @IsOptional()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: "Enter a WhatsApp number in international format, for example +14155552671."
  })
  whatsappNumber?: string | null;
}
