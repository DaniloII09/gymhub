import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { toSkipTake } from '@Common/pagination';
import {
  Prisma,
  type Charge,
  type ChargeStatus,
  type ChargeType,
} from '@PrismaClient';

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

/** Tipos por los que se puede filtrar el listado de pendientes (H17). */
export const PENDING_CHARGE_TYPES = ['MEMBERSHIP', 'PERSONAL_SESSION'] as const;
export type PendingChargeType = (typeof PENDING_CHARGE_TYPES)[number];

/** Un cobro pendiente en el listado del administrador (H17). */
export interface PendingChargeRow {
  id: number;
  memberCode: string | null;
  fullName: string;
  concept: string;
  amount: number;
  dueDate: Date;
  daysLate: number;
}

export interface PendingChargesPage {
  rows: PendingChargeRow[];
  /** Cobros que cumplen el filtro, en todas las páginas. */
  total: number;
  /** Suma de los montos que cumplen el filtro, en todas las páginas. */
  totalOwed: number;
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
   * Cobros PENDING de todos los miembros (BE-17.1).
   *
   * `daysLate` = hoy − dueDate en días, mínimo 0. Se calcula en la consulta
   * para poder ordenar por él: de más a menos días de atraso y, con los mismos
   * días, por nombre del miembro. `today` lo pone el servicio con la fecha del
   * servidor en la zona del gimnasio.
   *
   * `total` y `totalOwed` salen de un agregado aparte con el mismo filtro, así
   * que suman todos los cobros que cumplen el filtro y no solo la página.
   */
  async findPending(
    filter: { type?: PendingChargeType; today: string },
    page: { page: number; pageSize: number },
  ): Promise<PendingChargesPage> {
    const { skip, take } = toSkipTake(page);
    const byType = filter.type
      ? Prisma.sql`AND c.type = ${filter.type}::"ChargeType"`
      : Prisma.empty;

    const [rows, totals] = await this.prisma.$transaction(
      [
        this.prisma.$queryRaw<
          (Omit<PendingChargeRow, 'amount'> & { amount: Prisma.Decimal })[]
        >`
        SELECT c.id,
               u."memberCode",
               u."fullName",
               c.concept,
               c.amount,
               c.due_date AS "dueDate",
               GREATEST(${filter.today}::date - c.due_date, 0)::int AS "daysLate"
          FROM charges c
          JOIN users u ON u.id = c.member_id
         WHERE c.status = 'PENDING' ${byType}
         ORDER BY "daysLate" DESC, u."fullName" ASC, c.id ASC
         LIMIT ${take} OFFSET ${skip}`,
        this.prisma.charge.aggregate({
          where: { status: 'PENDING', type: filter.type },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        // Las dos consultas ven la misma foto de la base: la suma siempre
        // coincide con las filas, aunque alguien pague mientras tanto.
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return {
      rows: rows.map((row) => ({ ...row, amount: Number(row.amount) })),
      total: totals._count._all,
      totalOwed: Number(totals._sum.amount ?? 0),
    };
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
