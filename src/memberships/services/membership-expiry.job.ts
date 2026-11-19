import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MembershipRepository } from '@Memberships/repositories';
import { GYM_TIME_ZONE, gymToday } from './membership-dates.js';

/**
 * Tarea diaria de BE-4.3: todos los días a las 00:05, hora de El Salvador.
 *
 * Solo sincroniza el estado guardado en `memberships` (pagadas a ACTIVE y
 * vencidas a EXPIRED, con statusChangedAt). Las pantallas no dependen de que
 * corra: MembershipStatusService calcula el estado al leer.
 */
@Injectable()
export class MembershipExpiryJob {
  private readonly logger = new Logger(MembershipExpiryJob.name);

  constructor(private readonly membershipRepository: MembershipRepository) {}

  @Cron('5 0 * * *', { name: 'membership-expiry', timeZone: GYM_TIME_ZONE })
  async handle(now: Date = new Date()): Promise<void> {
    const today = gymToday(now);
    try {
      const { activated, expired } = await this.membershipRepository.syncStatuses(today, now);
      this.logger.log(`Membresías del ${today}: ${activated} activadas y ${expired} vencidas.`);
    } catch (error) {
      // Si falla, la de mañana lo vuelve a intentar: el cambio es idempotente.
      this.logger.error('Falló la tarea diaria de vencimiento de membresías.', error);
    }
  }
}
