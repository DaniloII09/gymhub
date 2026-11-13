import { Injectable } from '@nestjs/common';
import type {
  NotificationService as NotificationContract,
  NotifyInput,
} from '@Common/contracts';
import { NotificationValidationError } from '@Notifications/errors';
import { NotificationRepository } from '@Notifications/repositories';
import { NotificationSource, type Prisma } from '@PrismaClient';

export const MAX_RECIPIENTS = 500;
export const TITLE_MAX_LENGTH = 80;
export const MESSAGE_MAX_LENGTH = 300;
export const REFERENCE_ID_MAX_LENGTH = 40;

const SOURCES: ReadonlySet<string> = new Set(Object.values(NotificationSource));
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Servicio central de avisos (BE-24.1 / H24). Implementa el contrato
 * NOTIFICATION_SERVICE, que es la única forma en que los demás módulos avisan
 * a un miembro o a un grupo: H26 al avisar un vencimiento y H27 al avisar una
 * clase cancelada.
 */
@Injectable()
export class NotificationsService implements NotificationContract {
  constructor(
    private readonly notificationRepository: NotificationRepository,
  ) {}

  /**
   * Registra un aviso por destinatario dentro de la transacción de quien llama
   * y devuelve cuántos avisos creó. Si esa transacción se revierte, no queda
   * ningún aviso.
   *
   * Un destinatario repetido recibe un solo aviso.
   *
   * @throws {NotificationValidationError} si falta un campo o se pasa de largo,
   * la lista está vacía o tiene más de 500 usuarios, el módulo de origen no
   * existe o algún destinatario no existe o está inactivo. En ese caso no se
   * registra ningún aviso.
   */
  async notify(
    input: NotifyInput,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const recipients = this.validRecipients(input.recipients);
    const title = this.requiredText(input.title, 'título', TITLE_MAX_LENGTH);
    const message = this.requiredText(
      input.message,
      'mensaje',
      MESSAGE_MAX_LENGTH,
    );
    const source = this.validSource(input.source);
    const referenceId = this.validReferenceId(input.referenceId);

    const activeUsers = await this.notificationRepository.countActiveUsers(
      recipients,
      tx,
    );
    if (activeUsers !== recipients.length) {
      throw new NotificationValidationError(
        'Algún destinatario no existe o está inactivo.',
      );
    }

    return this.notificationRepository.createMany(
      { userIds: recipients, source, title, message, referenceId },
      tx,
    );
  }

  private validRecipients(recipients: unknown): string[] {
    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new NotificationValidationError(
        'El aviso necesita al menos un destinatario.',
      );
    }
    if (
      !recipients.every((id) => typeof id === 'string' && UUID_PATTERN.test(id))
    ) {
      throw new NotificationValidationError(
        'Algún destinatario no es un id de usuario válido.',
      );
    }
    const unique = [...new Set(recipients as string[])];
    if (unique.length > MAX_RECIPIENTS) {
      throw new NotificationValidationError(
        `Un aviso admite como máximo ${MAX_RECIPIENTS} destinatarios.`,
      );
    }
    return unique;
  }

  private requiredText(value: unknown, field: string, max: number): string {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.length === 0 || text.length > max) {
      throw new NotificationValidationError(
        `El ${field} del aviso debe tener entre 1 y ${max} caracteres.`,
      );
    }
    return text;
  }

  private validSource(source: unknown): NotificationSource {
    if (typeof source !== 'string' || !SOURCES.has(source)) {
      throw new NotificationValidationError(
        `El módulo de origen "${String(source)}" no está en la lista de módulos.`,
      );
    }
    return source as NotificationSource;
  }

  private validReferenceId(referenceId: unknown): string | undefined {
    if (referenceId === undefined || referenceId === null) return undefined;
    const text = typeof referenceId === 'string' ? referenceId.trim() : '';
    if (text.length === 0 || text.length > REFERENCE_ID_MAX_LENGTH) {
      throw new NotificationValidationError(
        `La referencia del aviso debe tener entre 1 y ${REFERENCE_ID_MAX_LENGTH} caracteres.`,
      );
    }
    return text;
  }
}
