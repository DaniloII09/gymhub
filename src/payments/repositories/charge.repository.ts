import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Charge, ChargeStatus, ChargeType, Prisma } from '@PrismaClient';

export interface CreateChargeData {
  memberId: string;
  type: ChargeType;
  concept: string;
  amount: number;
  dueDate: Date;
  membershipId?: number;
}

/** Miembro que se puede elegir en la pantalla de cobro. */
export interface MemberOption {
  id: string;
  email: string;
}

/** Cantidad máxima de resultados de la búsqueda de miembros. */
const MEMBER_SEARCH_LIMIT = 10;

/** Único punto del módulo que habla con la tabla `charges`. */
@Injectable()
export class ChargeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea el cobro con el cliente de la transacción de quien llama: si esa
   * transacción se revierte, el cobro tampoco queda.
   */
  create(
    data: CreateChargeData,
    tx: Prisma.TransactionClient,
  ): Promise<Charge> {
    return tx.charge.create({
      data: {
        memberId: data.memberId,
        type: data.type,
        concept: data.concept,
        amount: data.amount,
        dueDate: data.dueDate,
        membershipId: data.membershipId ?? null,
      },
    });
  }

  /** Cobros del miembro, del que vence primero al último. */
  findByMember(memberId: string, status?: ChargeStatus): Promise<Charge[]> {
    return this.prisma.charge.findMany({
      where: { memberId, status },
      // `id` desempata dos cobros con la misma fecha de vencimiento.
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    });
  }

  /** Solo cuentan los usuarios con rol Miembro. */
  memberExists(memberId: string): Promise<boolean> {
    return this.prisma.user
      .count({ where: { id: memberId, role: 'MEMBER' } })
      .then((count) => count > 0);
  }

  /**
   * Miembros activos cuyo correo contiene el texto buscado.
   * Cuando H01 agregue fullName y memberCode, se suman al OR.
   */
  searchMembers(term: string): Promise<MemberOption[]> {
    return this.prisma.user.findMany({
      where: {
        role: 'MEMBER',
        isActive: true,
        OR: [{ email: { contains: term, mode: 'insensitive' } }],
      },
      select: { id: true, email: true },
      orderBy: { email: 'asc' },
      take: MEMBER_SEARCH_LIMIT,
    });
  }
}
