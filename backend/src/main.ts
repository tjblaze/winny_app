import "./config/environment";
import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { static as serveStatic } from "express";
import type { NextFunction, Request, Response } from "express";
import { resolve } from "node:path";
import { AppModule } from "./app.module";
import { getJwtSecret } from "./config/jwt-secret";

async function bootstrap() {
  getJwtSecret();

  const app = await NestFactory.create(AppModule);
  app.use(
    "/uploads",
    serveStatic(resolve(__dirname, "../uploads"), { fallthrough: false, index: false })
  );
  const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const origin = request.get("origin");
    if (origin && !allowedOrigins.includes(origin)) {
      response.status(403).json({ statusCode: 403, message: "Origin is not allowed." });
      return;
    }
    next();
  });
  app.use(cookieParser());
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  const port = Number(process.env.PORT ?? 4000);
  try {
    await app.listen(port, "0.0.0.0");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "EADDRINUSE"
    ) {
      console.error(
        `Port ${port} is already in use. Reuse the running API, stop the other process, or set PORT to an available port.`
      );
      await app.close();
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  console.log(`Savor API listening on http://localhost:${port}/api`);
}

void bootstrap();
