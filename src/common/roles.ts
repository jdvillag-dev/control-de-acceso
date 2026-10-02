import { SetMetadata } from '@nestjs/common';

export enum Role {
  ADMIN = 'ADMIN',
  LEADER = 'LEADER',
  EMPLOYEE = 'EMPLOYEE',
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
export const PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export interface AuthUser {
  sub: string;
  email: string;
  role: Role;
  employeeId: string | null;
}
