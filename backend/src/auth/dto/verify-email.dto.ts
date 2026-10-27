import { IsString, MaxLength, MinLength } from "class-validator";

export class VerifyEmailDto {
  @IsString()
  @MinLength(32)
  @MaxLength(100)
  token!: string;
}
