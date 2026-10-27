import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class VerifyEmailDto {
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  @Matches(/^\d{6}$/)
  code!: string;
}
