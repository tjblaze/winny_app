import type { UserRole } from "@prisma/client";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
};
