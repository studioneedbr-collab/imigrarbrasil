import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

/**
 * Hash de senha com scrypt.
 *
 * O formato antigo era `salt:hash`, com os parâmetros default do Node
 * (N=16384). Isso deixava o custo implícito: se um dia mudássemos N, todos os
 * hashes existentes deixariam de validar silenciosamente. O formato novo grava
 * os parâmetros junto — `scrypt$N$r$p$salt$hash` — então a verificação usa
 * sempre o custo com que aquele hash foi gerado, e dá para elevar N sem
 * invalidar ninguém.
 */

// OWASP (2024) para scrypt: N >= 2^17, r=8, p=1.
const N = 1 << 17;
const R = 8;
const P = 1;
const KEYLEN = 64;
// scrypt precisa de ~128*N*r bytes; o default do Node (32MB) não cobre N=2^17.
const MAXMEM = 256 * 1024 * 1024;

function derive(password: string, salt: string, n: number, r: number, p: number): Buffer {
  return scryptSync(password.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM });
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = derive(password, salt, N, R, P).toString("hex");
  return `scrypt$${N}$${R}$${P}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    let salt: string, hash: string, n = 16384, r = 8, p = 1;

    if (stored.startsWith("scrypt$")) {
      const [, sn, sr, sp, s, h] = stored.split("$");
      if (!sn || !sr || !sp || !s || !h) return false;
      n = Number(sn); r = Number(sr); p = Number(sp); salt = s; hash = h;
      if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
    } else {
      // Formato legado `salt:hash`, com os defaults do Node.
      const [s, h] = stored.split(":");
      if (!s || !h) return false;
      salt = s; hash = h;
    }

    const expected = Buffer.from(hash, "hex");
    if (expected.length !== KEYLEN) return false;
    const actual = derive(password, salt, n, r, p);
    return timingSafeEqual(actual, expected);
  } catch {
    // Hash corrompido ou parâmetros absurdos não devem derrubar o login.
    return false;
  }
}

/**
 * Hash de uma frase pública, com os parâmetros correntes. O login o usa para
 * gastar o mesmo tempo quando o e-mail não existe — sem isso, "usuário
 * inexistente" responde na hora e "senha errada" leva um scrypt inteiro, e essa
 * diferença de latência denuncia quem tem conta no sistema.
 *
 * Fixo, e não gerado no primeiro uso: gerar custava um scrypt a mais que o
 * caminho que ele deveria imitar. Não protege nada, então não é segredo.
 * Se N mudar, regrave este valor — `needsRehash(DUMMY_HASH)` guarda isso no teste.
 */
export const DUMMY_HASH =
  "scrypt$131072$8$1$6ec84c6f311a6b68e6b125cfacabe497$ae0982cd57c50a78f11f197c45d6f944ce6a62019eaebb022f42e8f1f835349b49adf176f0ce590ed4442447e052afefdc9a12cdb0996c60f9fd1f9814956b5b";

/** True quando o hash usa parâmetros antigos e vale regravar no próximo login. */
export function needsRehash(stored: string): boolean {
  if (!stored.startsWith("scrypt$")) return true;
  const n = Number(stored.split("$")[1]);
  return !Number.isInteger(n) || n < N;
}
