import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendVerificationEmail(email: string, name: string, token: string): Promise<void> {
    const host = process.env.SMTP_HOST?.trim();
    const portValue = process.env.SMTP_PORT?.trim();
    const user = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASS;
    const from = process.env.MAIL_FROM?.trim() || user;
    const frontendOrigin = process.env.FRONTEND_ORIGIN?.split(",")[0]?.trim();
    const port = Number(portValue);

    if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !password || !from || !frontendOrigin) {
      throw new ServiceUnavailableException(
        "Email verification is not configured. Please contact support."
      );
    }

    let frontendUrl: URL;
    try {
      frontendUrl = new URL(frontendOrigin);
    } catch {
      throw new ServiceUnavailableException(
        "Email verification is not configured. Please contact support."
      );
    }
    if (frontendUrl.protocol !== "http:" && frontendUrl.protocol !== "https:") {
      throw new ServiceUnavailableException(
        "Email verification is not configured. Please contact support."
      );
    }
    const verificationUrl = new URL("/account", frontendUrl.origin);
    verificationUrl.searchParams.set("verify", token);
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass: password }
    });

    try {
      await transporter.sendMail({
        from,
        to: email,
        subject: "Verify your Savor email",
        text: `Hi ${name},\n\nVerify your email address to activate your Savor account:\n${verificationUrl.toString()}\n\nThis link expires in 24 hours. If you did not create this account, you can ignore this email.`
      });
    } catch {
      this.logger.error("Could not deliver an account verification email.");
      throw new ServiceUnavailableException(
        "Your account is waiting for email verification, but the verification email could not be sent. Please try resending it."
      );
    }
  }
}
