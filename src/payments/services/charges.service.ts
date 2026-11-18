import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ChargesService as ChargesContract,
  CreateChargeInput,
} from '@Common/contracts';
import { paginate, type Paginated } from '@Common/pagination';
import {
  ChargeRepository,
  type MemberOption,
  type PendingChargeRow,
  type PendingChargeType,
} from '@Payments/repositories';
import { InvalidChargeError } from '@Payments/errors';
import type { Charge, ChargeStatus, Prisma } from '@PrismaClient';
import { gymToday } from './gym-calendar.js';

export const MEMBER_NOT_FOUND_MESSAGE = 'No encontramos ese miembro.';
export const CONCEPT_MAX_LENGTH = 80;

/** Listado de pendientes del administrador con el total adeudado (H17). */
export interface PendingChargesResult extends Paginated<PendingChargeRow> {
  totalOwed: number;
}

/**
 * Servicio de cobros (BE-15.1). Implementa el contrato CHARGES_SERVICE, que es
 * la única forma en que otros módulos crean cobros: H04 al vender una
 * membresía y H11 al agendar una sesión personal.
 */
@Injectable()
export class ChargesService implements ChargesContract {
  constructor(private readonly chargeRepository: ChargeRepository) {}

  /**
   * Crea un cobro PENDING dentro de la transacción de quien llama.
   *
   * @throws {InvalidChargeError} si el monto no es mayor que 0 o el concepto
   * está vacío o pasa de 80 caracteres. Se lanza un error de dominio (y no un
   * 400) porque quien llama es otro servicio, no un cliente HTTP.
   */
  async createPending(
    input: CreateChargeInput,
    tx: Prisma.TransactionClient,
  ): Promise<{ chargeId: number }> {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new InvalidChargeError('El monto del cobro debe ser mayor que 0.');
    }
    const concept = input.concept.trim();
    if (concept.length === 0 || concept.length > CONCEPT_MAX_LENGTH) {
      throw new InvalidChargeError(
        `El concepto debe tener entre 1 y ${CONCEPT_MAX_LENGTH} caracteres.`,
      );
    }
    const charge = await this.chargeRepository.create(
      { ...input, concept },
      tx,
    );
    return { chargeId: charge.id };
  }

  /** GET /members/{memberId}/charges */
  async listByMember(
    memberId: string,
    status?: ChargeStatus,
  ): Promise<Charge[]> {
    // Sin esta verificación, un miembro inexistente respondería una lista
    // vacía, igual que un miembro sin cobros.
    if (!(await this.chargeRepository.memberExists(memberId))) {
      throw new NotFoundException(MEMBER_NOT_FOUND_MESSAGE);
    }
    return this.chargeRepository.findByMember(memberId, status);
  }

  /**
   * GET /charges/me (BE-16.1): cobros del miembro autenticado. El id sale del
   * token; no hay forma de pedir los de otro miembro.
   */
  listMine(memberId: string, status?: ChargeStatus): Promise<Charge[]> {
    return this.chargeRepository.findByMember(memberId, status);
  }

  /**
   * GET /charges/pending (BE-17.1): cobros pendientes de todos los miembros,
   * con días de atraso y el total adeudado de todo el filtro.
   */
  async listPending(
    query: { type?: PendingChargeType; page: number; pageSize: number },
    now: Date = new Date(),
  ): Promise<PendingChargesResult> {
    const { rows, total, totalOwed } = await this.chargeRepository.findPending(
      { type: query.type, today: gymToday(now) },
      query,
    );
    return {
      ...paginate(rows, total, query),
      // Montos de 2 decimales: se redondea para no arrastrar errores de coma flotante.
      totalOwed: Math.round(totalOwed * 100) / 100,
    };
  }

  /** GET /charges/member-search: miembros para la pantalla de cobro (FE-15.1). */
  searchMembers(term: string): Promise<MemberOption[]> {
    if (term.trim().length < 2) {
      throw new BadRequestException(
        'Escribe al menos 2 caracteres para buscar.',
      );
    }
    return this.chargeRepository.searchMembers(term.trim());
  }
}
