import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { env, useDeepseek } from "@/lib/env";
import { atividadeDaConversa, inicioDoDiaEmBrasilia } from "@/lib/dashboard/periodo";

export const dynamic = "force-dynamic";

// Signal panel data for the "Agente ao vivo" module (sidebar rail + overview hero).
export async function GET() {
  const repo = getRepository();
  const [conversations, leads] = await Promise.all([
    repo.listConversations(),
    repo.listLeads(),
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
    model: env.deepseekModel,
    mode: useDeepseek ? "real" : "simulação",
    conversations: conversations.length,
    conversationsToday,
    leads: leads.length,
    qualifiedRate,
  });
}
