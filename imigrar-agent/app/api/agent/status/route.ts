import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guard";
import { getRepository } from "@/lib/data";
import { llmEmUso } from "@/lib/agent/llm";
import { atividadeDaConversa, inicioDoDiaEmBrasilia } from "@/lib/dashboard/periodo";

export const dynamic = "force-dynamic";

// Signal panel data for the "Agente ao vivo" module (sidebar rail + overview hero).
export async function GET() {
  // A sessão é conferida AQUI, e não só no middleware: ele só olha se o cookie é válido, e
  // uma conta desativada continuava lendo esta rota. Ver getSession (lib/auth/guard.ts).
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const repo = getRepository();
  const [conversations, leads, llm] = await Promise.all([
    repo.listConversations(),
    repo.listLeads(),
    llmEmUso(),
  ]);

  // "Hoje" é o dia de calendário de BRASÍLIA, e conta quem foi ATENDIDO hoje — não quem
  // nasceu hoje. Antes: `setHours(0,0,0,0)` no relógio do servidor (UTC na Vercel, ou seja
  // 21h do dia anterior no Rio) sobre `createdAt`, e o painel marcava 0 num dia em que a
  // Shayene atendeu quatro clientes que voltaram. Ver lib/dashboard/periodo.
  const inicioDeHoje = inicioDoDiaEmBrasilia(new Date()).getTime();
  const conversationsToday = conversations.filter(
    (c) => new Date(atividadeDaConversa(c)).getTime() >= inicioDeHoje,
  ).length;

  // Qualificação = conversas que avançaram além de "aguardando" (negociação/transferida/finalizada).
  const qualified = conversations.filter(
    (c) => c.status === "negotiating" || c.status === "transferred" || c.status === "finished",
  ).length;
  const qualifiedRate =
    conversations.length > 0 ? Math.round((qualified / conversations.length) * 100) : 0;

  return NextResponse.json({
    // O modelo que está respondendo AGORA — o escolhido no painel, ou a reserva dele.
    model: llm?.modelo ?? null,
    mode: llm ? "real" : "simulação",
    conversations: conversations.length,
    conversationsToday,
    leads: leads.length,
    qualifiedRate,
  });
}
