// ONDE A CHAMADA VIRA LINHA.
//
// Um ponto só, chamado de dentro de cada provedor, por dois motivos:
//
//   1. O cálculo do custo não pode ser reescrito em cinco lugares. Se ele estiver em
//      cinco, no dia em que o preço mudar, quatro vão continuar com o preço velho — e
//      nenhuma delas vai dar erro.
//   2. Contabilizar NUNCA pode derrubar o que está sendo contabilizado. Um custo perdido
//      é um número; uma conversa perdida é uma pessoa. Por isso tudo aqui engole exceção.

import { custoDaChamada } from "@/lib/custos/precos";
import type { TipoChamadaLlm } from "@/lib/domain/types";

export interface ChamadaObservada {
  provedor: "deepseek" | "openai" | (string & {});
  modelo: string;
  tipo: TipoChamadaLlm;
  conversationId?: string | null;
  tokensEntrada?: number;
  tokensSaida?: number;
  /** Segundos de áudio, quando for transcrição. */
  segundos?: number | null;
  duracaoMs?: number | null;
  ok: boolean;
  erro?: string | null;
}

export async function registrarChamada(c: ChamadaObservada): Promise<void> {
  try {
    const custo = custoDaChamada({
      modelo: c.modelo,
      tipo: c.tipo,
      tokensEntrada: c.tokensEntrada,
      tokensSaida: c.tokensSaida,
      segundos: c.segundos,
    });
    const { getRepository } = await import("@/lib/data");
    await getRepository().registrarChamadaLlm({
      provedor: c.provedor,
      modelo: c.modelo,
      tipo: c.tipo,
      conversationId: c.conversationId ?? null,
      tokensEntrada: c.tokensEntrada ?? 0,
      tokensSaida: c.tokensSaida ?? 0,
      segundos: c.segundos ?? null,
      custoUsd: custo.usd,
      precoConhecido: custo.conhecido,
      duracaoMs: c.duracaoMs ?? null,
      ok: c.ok,
      erro: c.erro ? c.erro.slice(0, 500) : null,
    });
  } catch (err) {
    console.error("[custos] não consegui registrar a chamada:", err instanceof Error ? err.message : err);
  }
}

/** O `usage` que os dois provedores devolvem no mesmo formato (OpenAI-compatível). */
export interface UsoDeTokens {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export function tokensDe(uso: UsoDeTokens | undefined): { entrada: number; saida: number } {
  return { entrada: uso?.prompt_tokens ?? 0, saida: uso?.completion_tokens ?? 0 };
}
