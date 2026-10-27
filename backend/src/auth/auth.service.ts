import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import { createHmac, randomInt } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import type { JwtPayload, AuthUser } from "./auth.types";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import { EmailService } from "./email.service";
import { getJwtSecret } from "../config/jwt-secret";

const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService
  ) {}

  async register(input: RegisterDto): Promise<{ message: string }> {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hash(input.password, 12);
    const code = this.createVerificationCode();
    const codeHash = this.hashVerificationCode(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    try {
      const user = await this.prisma.user.create({
        data: {
          name: input.name.trim(),
          email,
          passwordHash,
          emailVerified: false,
          emailVerificationCodeHash: codeHash,
          emailVerificationExpiresAt: expiresAt,
          role: UserRole.CUSTOMER
        },
        select: { name: true, email: true }
      });
      await this.emailService.sendVerificationEmail(user.email, user.name, code);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      ) {
        const existingUser = await this.prisma.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, emailVerified: true }
        });
        if (existingUser && !existingUser.emailVerified) {
          await this.sendVerificationForUser(existingUser);
          return {
            message: "A 6-digit verification code was sent to your email. Enter it below to activate your account."
          };
        }
        throw new ConflictException("An account with this email already exists.");
      }
      throw error;
    }

    return { message: "A 6-digit verification code was sent to your email. Enter it below to activate your account." };
  }

  async verifyEmail(code: string): Promise<{ message: string }> {
    const result = await this.prisma.user.updateMany({
      where: {
        emailVerificationCodeHash: this.hashVerificationCode(code),
        emailVerified: false,
        emailVerificationExpiresAt: { gt: new Date() }
      },
      data: {
        emailVerified: true,
        emailVerificationCodeHash: null,
        emailVerificationExpiresAt: null
      }
    });
    if (result.count !== 1) {
      throw new UnauthorizedException("This verification code is invalid or has expired.");
    }
    return { message: "Email verified. You can now sign in." };
  }

  async resendVerification(emailInput: string): Promise<{ message: string }> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, emailVerified: true }
    });
    if (user && !user.emailVerified) {
      await this.sendVerificationForUser(user);
    }
    return { message: "If an unverified account exists for that email, a new verification code has been sent." };
  }

  async login(input: LoginDto): Promise<{ user: AuthUser; token: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.trim().toLowerCase() }
    });
    if (!user || !(await compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException("Email or password is incorrect.");
    }
    if (!user.emailVerified) {
      throw new ForbiddenException("Please verify your email address before signing in.");
    }
    const safeUser: AuthUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };
    return { user: safeUser, token: await this.createToken(safeUser) };
  }

  async becomeVendor(user: AuthUser): Promise<{ user: AuthUser; token: string }> {
    if (user.role === UserRole.VENDOR) {
      throw new ConflictException("This account is already set up as a vendor.");
    }
    const vendor: AuthUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { role: UserRole.VENDOR },
      select: safeUserSelect
    });
    return { user: vendor, token: await this.createToken(vendor) };
  }

  async findUser(id: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: safeUserSelect
    });
    if (!user) throw new UnauthorizedException("Your session is no longer valid.");
    return user;
  }

  private createToken(user: AuthUser): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role
    };
    return this.jwtService.signAsync(payload);
  }

  private createVerificationCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, "0");
  }

  private hashVerificationCode(code: string): string {
    return createHmac("sha256", getJwtSecret()).update(code).digest("hex");
  }

  private async sendVerificationForUser(user: {
    id: string;
    name: string;
    email: string;
  }): Promise<void> {
    const code = this.createVerificationCode();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationCodeHash: this.hashVerificationCode(code),
        emailVerificationExpiresAt: new Date(Date.now() + 10 * 60 * 1000)
      }
    });
    await this.emailService.sendVerificationEmail(user.email, user.name, code);
  }
}
