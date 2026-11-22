import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../src/auth/guards/roles.guard.js';

type Role = 'ADMIN' | 'RECEPTION' | 'TRAINER' | 'MEMBER';
type Controller = abstract new (...args: never[]) => object;

/**
 * Ejecuta el RolesGuard real sobre un método de un controller, como si la
 * petición llegara con un usuario del rol indicado. Devuelve true si el guard
 * deja pasar y false si responde 403.
 */
export function roleCanCall(
  controller: Controller,
  method: string,
  role: Role,
): boolean {
  const handler = (controller.prototype as Record<string, unknown>)[method];
  if (typeof handler !== 'function') {
    throw new Error(`${controller.name}.${method} no existe`);
  }
  const context = {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
  try {
    return new RolesGuard(new Reflector()).canActivate(context);
  } catch {
    return false;
  }
}

/** Roles que el guard deja pasar en ese método. */
export function rolesAllowed(controller: Controller, method: string): Role[] {
  const all: Role[] = ['ADMIN', 'RECEPTION', 'TRAINER', 'MEMBER'];
  return all.filter((role) => roleCanCall(controller, method, role));
}
