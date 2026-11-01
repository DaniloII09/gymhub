import { SetMetadata } from '@nestjs/common';
import type { User } from '@PrismaClient';

// El tipo del rol sale del propio User de Prisma, así no dependemos de en qué
// archivo quedó el enum dentro del cliente generado.
type Role = User['role'];

export const ROLES_KEY = 'roles';

/**
 * Restringe un endpoint a uno o varios roles.
 * Ej: @Roles('ADMIN', 'RECEPTION')
 *
 * Sin este decorador la ruta queda disponible para cualquier usuario
 * autenticado (el JwtAuthGuard ya exigió sesión).
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
