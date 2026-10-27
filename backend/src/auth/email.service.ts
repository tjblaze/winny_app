import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendVerificationEmail(email: string, name: string, code: string): Promise<void> {
    const host = process.env.SMTP_HOST?.trim();
    const portValue = process.env.SMTP_PORT?.trim();
    const user = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASS;
    const from = process.env.MAIL_FROM?.trim() || user;
    const port = Number(portValue);

    if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !password || !from) {
      throw new ServiceUnavailableException(
        "Email verification is not configured. Please contact support."
      );
    }

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
        subject: "Your Savor verification code",
        text: `Hi ${name},\n\nYour Savor verification code is: ${code}\n\nEnter this 6-digit code on the verification screen to activate your account. It expires in 10 minutes. If you did not create this account, you can ignore this email.`
      });
    } catch {
      this.logger.error("Could not deliver an account verification email.");
      throw new ServiceUnavailableException(
        "Your account is waiting for email verification, but the verification email could not be sent. Please try resending it."
      );
    }
  }
}
