import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE, type SessionPayload } from "@/lib/auth/session";
import { getRepository } from "@/lib/data";
import { useSupabase } from "@/lib/env";
import { normalizarPapel } from "@/lib/auth/papeis";

/**
 * O middleware já barra requisição sem sessão em /api/*. Estes helpers são a
 * segunda camada: se um dia o matcher do middleware for alterado por engano, as
 * rotas sensíveis continuam fechadas por conta própria. Também é aqui que mora a
 * checagem de papel — middleware não deve carregar regra de autorização.
 */

/**
 * A CONTA AINDA VALE? O cookie diz quem a pessoa ERA no login: o papel vai dentro dele, e
 * o middleware o renova por mais 7 dias a cada visita. Sem reler a conta, desativar alguém
 * ou rebaixar um advogado a atendente não tinha efeito nenhum enquanto a pessoa usasse o
 * painel — ela continuava exportando, indefinidamente.
 *
 * Aqui a conta é relida do banco (com um cache curto, para não virar uma consulta por
 * requisição) e vale o que está lá AGORA: inativa ou apagada derruba a sessão; papel
 * trocado passa a valer. "Agora" quer dizer em até 1 minuto: é o tempo do cache, por
 * instância do servidor.
 *
 * FALHA DE BANCO NÃO DERRUBA NINGUÉM: com o banco fora, o painel inteiro já está fora, e
 * transformar isso em "todo mundo deslogado" só piora a volta. Vale o cookie até o banco
 * responder.
 */
const CACHE_DA_CONTA_MS = 60_000;
const cacheDaConta = new Map<string, { em: number; conta: { id: string; active: boolean; role: string } | null }>();

async function contaAtual(email: string): Promise<{ id: string; active: boolean; role: string } | null | "erro"> {
  const visto = cacheDaConta.get(email);
  if (visto && Date.now() - visto.em < CACHE_DA_CONTA_MS) return visto.conta;
  try {
    const u = await getRepository().getUserByEmail(email);
    const conta = u ? { id: u.id, active: u.active !== false, role: u.role } : null;
    cacheDaConta.set(email, { em: Date.now(), conta });
    return conta;
  } catch {
    return "erro";
  }
}

/** Para testes e para a troca de papel: esquece o que estava em cache. */
export function esquecerConta(email?: string): void {
  if (email) cacheDaConta.delete(email);
  else cacheDaConta.clear();
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) return null;

  const conta = await contaAtual(session.email);
  if (conta === "erro") return session;
  if (conta === null) {
    // Conta apagada. No repositório em memória (testes e desenvolvimento) as sessões são
    // montadas sem conta de verdade — lá a ausência não diz nada.
    return useSupabase ? null : session;
  }
  if (!conta.active) return null;
  // A MESMA PESSOA, e não só o mesmo e-mail. Uma conta apagada e recriada — ou um e-mail
  // de setor ("atendimento@") passado para outra pessoa — não pode aceitar o cookie
  // antigo: ele carregaria o id velho para "Meus" e para o dono dos casos.
  if (useSupabase && conta.id !== session.sub) return null;
  return { ...session, role: normalizarPapel(conta.role) };
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
