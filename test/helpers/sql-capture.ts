/** Una consulta $queryRaw capturada: el SQL con los parámetros como `?`. */
export interface CapturedQuery {
  sql: string;
  /** Parámetros en orden, con los de los fragmentos Prisma.sql anidados. */
  values: unknown[];
}

interface SqlLike {
  strings: readonly string[];
  values: readonly unknown[];
}

const isSql = (v: unknown): v is SqlLike =>
  !!v && typeof v === 'object' && 'strings' in v && 'values' in v;

function render(
  strings: readonly string[],
  values: readonly unknown[],
  out: unknown[],
): string {
  return strings.reduce((acc, s, i) => {
    if (i >= values.length) return acc + s;
    const v = values[i];
    if (isSql(v)) return acc + s + render(v.strings, v.values, out);
    out.push(v);
    return acc + s + '?';
  }, '');
}

/**
 * Sustituto de `prisma.$queryRaw` que guarda cada consulta y responde, en
 * orden, las filas de `responses` (la última se repite).
 */
export function captureQueryRaw(responses: unknown[][]) {
  const queries: CapturedQuery[] = [];
  const fn = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const out: unknown[] = [];
    queries.push({
      sql: render(strings, values, out).replace(/\s+/g, ' '),
      values: out,
    });
    return Promise.resolve(
      responses[Math.min(queries.length - 1, responses.length - 1)],
    );
  });
  return { fn, queries };
}
