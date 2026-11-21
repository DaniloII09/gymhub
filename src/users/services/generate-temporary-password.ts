import { randomInt } from 'node:crypto';

// Sets sin caracteres ambiguos (l, I, O, 0, 1) para que se pueda dictar/copiar.
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALL = LOWER + UPPER + DIGITS;

/**
 * Contraseña temporal de 10 caracteres con al menos una minúscula, una
 * mayúscula y un dígito. Usa randomInt (CSPRNG), nunca Math.random.
 * H02 reutiliza esta función para el personal.
 */
export function generateTemporaryPassword(length = 10): string {
  const chars = [
    pick(LOWER),
    pick(UPPER),
    pick(DIGITS),
    ...Array.from({ length: length - 3 }, () => pick(ALL)),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function pick(set: string): string {
  return set[randomInt(set.length)];
}