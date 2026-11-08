import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_PENDING_KEY = 'allowPasswordChangePending';

/**
 * Marca las rutas accesibles aunque el usuario tenga mustChangePassword en true
 * (GET /auth/me y PATCH /auth/password). El resto queda bloqueado por el guard.
 */
export const AllowPasswordChangePending = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_PENDING_KEY, true);