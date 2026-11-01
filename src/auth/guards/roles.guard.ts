import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { RequestWithUser } from '../decorators/current-user.decorator.js';
import type { User } from '@PrismaClient';

type Role = User['role'];

/**
 * Guard de roles global. Se registra DESPUÉS de JwtAuthGuard en app.module, así
 * que lee el rol de `request.user`, que el guard de JWT ya cargó fresco de la
 * BD en esta misma request. Por eso un cambio de rol o una desactivación aplica
 * desde la siguiente solicitud, sin esperar a que expire el token.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin @Roles() la ruta no filtra por rol.
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<RequestWithUser>();

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('No tenés permiso para esta acción.');
    }

    return true;
  }
}
