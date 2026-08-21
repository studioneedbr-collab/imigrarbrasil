import { timingSafeEqual } from "crypto";

// Comparação de segredos em tempo constante (evita timing attacks). Comprimentos
// diferentes retornam false sem vazar tempo pelo próprio timingSafeEqual.
export function timingSafeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a ?? "");
  const bb = Buffer.from(b ?? "");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
