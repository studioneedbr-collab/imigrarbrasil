// Relativo, e não `@/`: este arquivo está no grafo do middleware, que é empacotado
// para o Edge Runtime — e ali o alias não resolve (ver o comentário em middleware.ts).
// A regra vale para TODO módulo alcançável a partir do middleware, e tem teste:
// tests/middleware-edge.test.ts falha se um `@/` reaparecer neste grafo.
import { normalizarPapel, type Papel } from "./papeis";

// ─────────────────────────────────────────────────────────────────────────────
// POR QUE ESTE ARQUIVO NÃO USA UMA BIBLIOTECA DE JWT
//
// Usava a `jose`, e o deploy quebrava na Vercel:
//
//   The Edge Function "middleware" is referencing unsupported modules:
//     @/lib/auth/session, @/lib/auth/public-paths
//
// O middleware é a única porta de autenticação do sistema e roda no Edge Runtime.
// A `jose` traz, pelo barrel, o caminho de JWE que toca CompressionStream — o
// bundler do Edge recusa, e aí NADA sobe: não é o login que fica capenga, é o
// deploy inteiro que não acontece.
//
// HS256 é HMAC-SHA-256 com base64url em volta. A Web Crypto faz isso nativamente,
// igual no Edge e no Node, sem dependência nenhuma. Trinta linhas de código que a
// gente controla valem mais do que uma dependência que decide se o produto sobe.
//
// O que continua garantido, e está coberto por teste (tests/security.test.ts):
// algoritmo fixo em HS256 (token forjado com "alg":"none" é recusado), assinatura
// conferida antes de qualquer leitura do conteúdo, e expiração respeitada.
// ─────────────────────────────────────────────────────────────────────────────

const enc = new TextEncoder();

function base64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlFromString(texto: string): string {
  return base64urlFromBytes(enc.encode(texto));
}

function stringFromBase64url(b64: string): string {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    b64.length + ((4 - (b64.length % 4)) % 4),
    "=",
  );
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function bytesFromBase64url(b64: string): ArrayBuffer {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    b64.length + ((4 - (b64.length % 4)) % 4),
    "=",
  );
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  // ArrayBuffer e não Uint8Array: é o que a Web Crypto aceita sem ambiguidade de tipo
  // entre os runtimes (o Uint8Array pode estar sobre um SharedArrayBuffer).
  return bytes.buffer;
}

async function chaveHmac(): Promise<CryptoKey> {
  // O segredo sai como Uint8Array; `.slice()` devolve um ArrayBuffer limpo, que é o
  // que a Web Crypto tipa como BufferSource em todo runtime.
  const bruto = getSecret();
  return crypto.subtle.importKey(
    "raw",
    bruto.buffer.slice(bruto.byteOffset, bruto.byteOffset + bruto.byteLength) as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// O nome do cookie era "shine_session", da base que originou este código. Trocar invalida
// as sessões abertas — quem estiver logado faz login de novo, uma vez.
export const SESSION_COOKIE = "ib_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 dias, com renovação a cada uso

/**
 * A validade era de 8h fixas e sem renovação: quem entrava às 9h caía às 17h no
 * meio do expediente, e quem voltava no dia seguinte sempre reencontrava a tela
 * de login. Agora a janela é deslizante — o middleware regrava o cookie quando
 * já passou da metade da validade, então só cai de fato quem passa 7 dias
 * inteiros sem abrir o painel.
 *
 * Renovar só depois da metade (e não a cada requisição) evita pendurar um
 * Set-Cookie em toda resposta de API.
 */
export const SESSION_RENEW_AFTER_SECONDS = SESSION_MAX_AGE_SECONDS / 2;

const DEV_SECRET = "dev-insecure-secret-change-me";
const MIN_SECRET_LENGTH = 32;

/**
 * Resolvido a cada chamada (e não no import) de propósito: assim um deploy sem
 * AUTH_SECRET falha na primeira requisição, e não durante o `next build`.
 * Em produção NÃO há fallback — cair no default significaria que qualquer um que
 * leia este arquivo consegue assinar um cookie de admin válido.
 */
function getSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET ?? "";
  const isProd = process.env.NODE_ENV === "production";

  if (!raw) {
    if (isProd) {
      throw new Error(
        "[auth] AUTH_SECRET ausente em produção. Gere com `openssl rand -hex 32` e configure na Vercel.",
      );
    }
    return new TextEncoder().encode(DEV_SECRET);
  }
  if (isProd && (raw === DEV_SECRET || raw.length < MIN_SECRET_LENGTH)) {
    throw new Error(
      `[auth] AUTH_SECRET fraca em produção (mínimo ${MIN_SECRET_LENGTH} caracteres e diferente do default de dev).`,
    );
  }
  return new TextEncoder().encode(raw);
}

// O papel e suas regras moram em lib/auth/papeis.ts. O alias fica porque o nome
// `UserRole` já está espalhado pelo código; o conjunto de valores é o de lá.
export type UserRole = Papel;

export interface SessionPayload {
  sub: string;
  email: string;
  role: UserRole;
}

/** O que sai da verificação: os dados da sessão + quando ela expira (epoch em segundos). */
export interface VerifiedSession extends SessionPayload {
  exp: number;
}

/**
 * Atributos do cookie de sessão. Vivem aqui, num lugar só, porque agora são
 * gravados em dois pontos (login e renovação no middleware) — se divergissem, a
 * renovação silenciosamente encurtaria ou afrouxaria o cookie do login.
 *
 * `sameSite: "lax"` e não `"strict"`: com `strict` o navegador NÃO envia o cookie
 * em navegação de topo vinda de outro site. Abrir o painel por um link do
 * WhatsApp, do e-mail ou do Google chegava sem cookie, o middleware não via
 * sessão nenhuma e mandava para /login — parecia que o login "tinha caído".
 * `lax` mantém o bloqueio no que interessa contra CSRF (POST/PATCH/DELETE
 * cross-site continuam sem cookie) e libera só a navegação de leitura.
 *
 * Função e não constante: `secure` depende de NODE_ENV, que precisa ser lido na
 * chamada — mesma razão pela qual o segredo é resolvido a cada chamada.
 */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/** True quando a sessão já passou da metade da validade e vale regravar o cookie. */
export function shouldRenew(session: { exp: number }, nowSeconds?: number): boolean {
  const agora = nowSeconds ?? Math.floor(Date.now() / 1000);
  return session.exp - agora < SESSION_RENEW_AFTER_SECONDS;
}

export async function createSession(p: SessionPayload): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = base64urlFromString(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const corpo = base64urlFromString(
    JSON.stringify({
      sub: p.sub,
      email: p.email,
      role: p.role,
      iat: agora,
      exp: agora + SESSION_MAX_AGE_SECONDS,
    }),
  );
  const assinado = `${cabecalho}.${corpo}`;
  const assinatura = await crypto.subtle.sign("HMAC", await chaveHmac(), enc.encode(assinado));
  return `${assinado}.${base64urlFromBytes(new Uint8Array(assinatura))}`;
}

export async function verifySession(token: string): Promise<VerifiedSession | null> {
  try {
    const partes = token.split(".");
    if (partes.length !== 3) return null;
    const [cabecalho64, corpo64, assinatura64] = partes;

    // ALGORITMO FIXO. Sem esta checagem, um token forjado com "alg":"none" — ou com
    // qualquer outro algoritmo — poderia ser aceito. É a falha clássica de JWT.
    const cabecalho = JSON.parse(stringFromBase64url(cabecalho64)) as { alg?: string };
    if (cabecalho.alg !== "HS256") return null;

    // A assinatura é conferida ANTES de olhar o conteúdo: `crypto.subtle.verify` faz a
    // comparação em tempo constante, então não vaza informação por timing.
    const valida = await crypto.subtle.verify(
      "HMAC",
      await chaveHmac(),
      bytesFromBase64url(assinatura64),
      enc.encode(`${cabecalho64}.${corpo64}`),
    );
    if (!valida) return null;

    const payload = JSON.parse(stringFromBase64url(corpo64)) as Record<string, unknown>;
    if (!payload.sub || typeof payload.email !== "string") return null;
    if (typeof payload.exp !== "number") return null;
    // Token expirado é token inválido. O `exp` também desce daqui para o middleware
    // decidir se vale renovar o cookie.
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

    return {
      sub: String(payload.sub),
      email: payload.email,
      // Papel desconhecido (token antigo, conta legada) vira o mais restrito.
      role: normalizarPapel(payload.role),
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}
