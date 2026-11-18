import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  ExpiryNoticesService,
  GYM_TIME_ZONE,
} from './expiry-notices.service.js';

/** Tarea diaria de H26: todos los días a las 07:00, hora de El Salvador. */
@Injectable()
export class ExpiryNoticesJob {
  private readonly logger = new Logger(ExpiryNoticesJob.name);

  constructor(private readonly expiryNotices: ExpiryNoticesService) {}

  @Cron('0 7 * * *', {
    name: 'membership-expiry-notices',
    timeZone: GYM_TIME_ZONE,
  })
  async handle(): Promise<void> {
    try {
      await this.expiryNotices.runFor();
    } catch (error) {
      // Si falla, la tarea de mañana vuelve a intentar sin repetir avisos.
      this.logger.error('Falló la tarea de avisos de vencimiento.', error);
    }
  }
}
