import type { Lead, Message, LeadStage } from "@/lib/domain/types";

// Lead score 0–100, transparente e explicável. Quatro componentes de 0–25:
//  • engajamento    — volume de mensagens do lead (mais troca = mais quente)
//  • responsividade — quanto o lead responde ao agente (respostas / perguntas)
//  • velocidade     — quão rápido responde (gaps curtos entre agente→lead)
//  • interesse      — sinais de compra: estágio do funil + serviço + quantidade + valor
// O resultado vem com o detalhamento por componente para exibir no card do lead.

export interface LeadScoreBreakdown {
  engajamento: number;
  responsividade: number;
  velocidade: number;
  interesse: number;
}
export interface LeadScoreResult {
  score: number;
  breakdown: LeadScoreBreakdown;
}

const STAGE_INTEREST: Record<LeadStage, number> = {
  novo: 2,
  qualificado: 10,
  orcado: 20,
  transferido: 16,
  ganho: 25,
  perdido: 0,
  desqualificado: 0,
};

function clamp(n: number, min = 0, max = 25): number {
  return Math.max(min, Math.min(max, n));
}

export function computeLeadScore(input: {
  messages: Pick<Message, "role" | "createdAt">[];
  lead?: Pick<Lead, "stage" | "servicesInterested" | "employeesNeeded" | "estimatedValue"> | null;
}): LeadScoreResult {
  const msgs = input.messages ?? [];
  const userMsgs = msgs.filter((m) => m.role === "user");
  const agentMsgs = msgs.filter((m) => m.role === "assistant");

  // Engajamento: satura em ~8 mensagens do lead.
  const engajamento = clamp((userMsgs.length / 8) * 25);

  // Responsividade: respostas do lead / perguntas do agente (satura em 1).
  const ratio = agentMsgs.length ? userMsgs.length / agentMsgs.length : userMsgs.length ? 1 : 0;
  const responsividade = clamp(Math.min(ratio, 1) * 25);

  // Velocidade: mediana do gap agente→lead. <2min ≈ cheio, >60min ≈ baixo.
  const gaps: number[] = [];
  for (let i = 1; i < msgs.length; i++) {
    if (msgs[i].role === "user" && msgs[i - 1].role === "assistant") {
      const dt = new Date(msgs[i].createdAt).getTime() - new Date(msgs[i - 1].createdAt).getTime();
      if (dt >= 0) gaps.push(dt);
    }
  }
  let velocidade = 12.5; // neutro quando não há dados
  if (gaps.length) {
    const sorted = [...gaps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const minutes = median / 60000;
    // 2min → 25 ; 60min → ~0 (decai linear).
    velocidade = clamp(25 * (1 - (minutes - 2) / 58));
  }

  // Interesse: estágio + serviço + quantidade + valor estimado.
  let interesse = STAGE_INTEREST[input.lead?.stage ?? "novo"] ?? 2;
  if (input.lead?.servicesInterested?.length) interesse += 2;
  if (input.lead?.employeesNeeded) interesse += 2;
  if (input.lead?.estimatedValue) interesse += 3;
  interesse = clamp(interesse);

  const score = Math.round(engajamento + responsividade + velocidade + interesse);
  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: {
      engajamento: Math.round(engajamento),
      responsividade: Math.round(responsividade),
      velocidade: Math.round(velocidade),
      interesse: Math.round(interesse),
    },
  };
}
