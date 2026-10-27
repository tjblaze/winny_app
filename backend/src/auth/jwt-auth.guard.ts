import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser, JwtPayload } from "./auth.types";
import { AuthService } from "./auth.service";

type AuthenticatedRequest = Request & { user: AuthUser };
type SessionRequest = Request & { cookies?: Record<string, string> };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const token = request.cookies?.savor_session;
    if (!token) throw new UnauthorizedException("Sign in to continue.");

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      if (
        !payload.sub ||
        !payload.email ||
        (payload.role !== UserRole.CUSTOMER && payload.role !== UserRole.VENDOR)
      ) {
        throw new UnauthorizedException("Your session is invalid.");
      }
      (request as AuthenticatedRequest).user = await this.authService.findUser(payload.sub);
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("Your session has expired. Sign in again.");
    }
  }
}
