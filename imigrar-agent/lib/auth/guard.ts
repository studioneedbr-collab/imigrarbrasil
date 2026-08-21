import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE, type SessionPayload } from "@/lib/auth/session";

/**
 * O middleware já barra requisição sem sessão em /api/*. Estes helpers são a
 * segunda camada: se um dia o matcher do middleware for alterado por engano, as
 * rotas sensíveis continuam fechadas por conta própria. Também é aqui que mora a
 * checagem de papel — middleware não deve carregar regra de autorização.
 */

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return token ? verifySession(token) : null;
}

export const unauthorized = () =>
  NextResponse.json({ error: "Não autenticado." }, { status: 401 });

export const forbidden = () =>
  NextResponse.json({ error: "Permissão insuficiente." }, { status: 403 });

/** Retorna a sessão, ou a resposta de erro pronta para ser devolvida. */
export async function requireSession(): Promise<
  { ok: true; session: SessionPayload } | { ok: false; response: NextResponse }
> {
  const session = await getSession();
  if (!session) return { ok: false, response: unauthorized() };
  return { ok: true, session };
}

export async function requireAdmin(): Promise<
  { ok: true; session: SessionPayload } | { ok: false; response: NextResponse }
> {
  const session = await getSession();
  if (!session) return { ok: false, response: unauthorized() };
  if (session.role !== "admin") return { ok: false, response: forbidden() };
  return { ok: true, session };
}
