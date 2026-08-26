import { SignJWT, jwtVerify } from "jose";
import { normalizarPapel, type Papel } from "@/lib/auth/papeis";

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
  return new SignJWT({ email: p.email, role: p.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<VerifiedSession | null> {
  try {
    // `algorithms` fixo: sem isso, um token forjado com outro alg poderia ser
    // aceito dependendo da configuração da lib.
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.email !== "string") return null;
    // jwtVerify já rejeita token expirado; o `exp` só desce daqui para o
    // middleware decidir a renovação.
    if (typeof payload.exp !== "number") return null;
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
