/**
 * Forma estándar de una respuesta paginada. El que necesite campos extra
 * (ej. H06 agrega `totalsByStatus`) extiende de esta interfaz.
 */
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Arma la respuesta paginada a partir de los items y el total de la consulta. */
export function paginate<T>(
  data: T[],
  total: number,
  query: { page: number; pageSize: number },
): Paginated<T> {
  return { data, total, page: query.page, pageSize: query.pageSize };
}

/** Traduce page/pageSize a los `skip`/`take` que espera Prisma. */
export function toSkipTake(query: { page: number; pageSize: number }): {
  skip: number;
  take: number;
} {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}
