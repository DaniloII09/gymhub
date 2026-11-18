import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@Config';
import { SessionPricingUnavailableError } from '@Trainers/errors';
import { PersonalSessionRepository } from '@Trainers/repositories';

/**
 * Resuelve la tarifa configurada para sesiones personales (DB-11.1).
 * Prioriza la fila persistida en `personal_session_pricing` y, si no existe,
 * lee la variable opcional `PERSONAL_SESSION_PRICE`. Si ninguna está definida,
 * falla de forma cerrada con `SessionPricingUnavailableError` sin inventar
 * tarifas por defecto.
 */
@Injectable()
export class SessionPricingService {
  constructor(
    private readonly repository: PersonalSessionRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async getPricingStatus(): Promise<{
    configured: boolean;
    price: number | null;
  }> {
    const dbPrice = await this.repository.getConfiguredDbPrice();
    if (dbPrice !== null && Number.isFinite(dbPrice) && dbPrice > 0) {
      return { configured: true, price: dbPrice };
    }

    const envPrice = this.configService.get('PERSONAL_SESSION_PRICE', {
      infer: true,
    });
    if (envPrice !== null && Number.isFinite(envPrice) && envPrice > 0) {
      return { configured: true, price: envPrice };
    }

    return { configured: false, price: null };
  }

  async requireConfiguredPrice(): Promise<number> {
    const status = await this.getPricingStatus();
    if (!status.configured || status.price === null) {
      throw new SessionPricingUnavailableError();
    }
    return status.price;
  }

  async updatePrice(
    price: number,
    updatedById: string,
  ): Promise<{ configured: true; price: number }> {
    const rounded = Math.round(price * 100) / 100;
    const saved = await this.repository.upsertDbPrice(rounded, updatedById);
    return { configured: true, price: saved };
  }
}
