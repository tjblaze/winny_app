import "dotenv/config";
import { randomBytes } from "node:crypto";

let developmentSecret: string | undefined;
let warnedAboutDevelopmentSecret = false;

export function getJwtSecret(): string {
  const configuredSecret = process.env.JWT_SECRET?.trim();
  const isExampleSecret =
    configuredSecret?.toLowerCase().includes("replace-with") ||
    configuredSecret?.toLowerCase().includes("change-me");

  if (configuredSecret && configuredSecret.length >= 32 && !isExampleSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Set JWT_SECRET to a unique random value of at least 32 characters before starting in production."
    );
  }

  if (!developmentSecret) {
    developmentSecret = randomBytes(48).toString("base64url");
  }

  if (!warnedAboutDevelopmentSecret) {
    console.warn(
      "JWT_SECRET is not configured. Using a temporary secret for local development; sessions will expire when the API restarts."
    );
    warnedAboutDevelopmentSecret = true;
  }

  return developmentSecret;
}
