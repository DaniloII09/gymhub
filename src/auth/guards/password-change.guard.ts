import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ALLOW_PASSWORD_CHANGE_PENDING_KEY } from '../decorators/allow-password-change-pending.decorator.js';
import type { RequestWithUser } from '../decorators/current-user.decorator.js';

/**
 * Mientras mustChangePassword sea true, solo se permiten las rutas marcadas con
 * @AllowPasswordChangePending (y las @Public). Cualquier otra devuelve 403 con
 * code PASSWORD_CHANGE_REQUIRED. Se registra DESPUÉS de JwtAuthGuard (necesita
 * request.user) y ANTES de RolesGuard, para que este 403 gane al de rol.
 */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const bypass = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ||
    this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_PENDING_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (bypass) return true;

    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (user?.mustChangePassword) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Debés cambiar tu contraseña temporal antes de continuar.',
      });
    }
    return true;
  }
}