import { useDeepseek } from "@/lib/env";
import { runFallback } from "@/lib/agent/fallback";

export interface AgentTurn {
  role: "user" | "assistant";
  content: string;
}
export interface ToolCallTrace {
  name: string;
  input: unknown;
  result: unknown;
}
export interface AgentRunResult {
  reply: string;
  toolCalls: ToolCallTrace[];
  /** Quem escreveu a resposta. O caminho sem LLM tem um repertório curto e repete de
   *  propósito, então a rede anti-repetição só vale para o modelo. */
  source?: "deepseek" | "fallback";
}

/**
 * Um LLM CONDUZ a conversa — recebe o system prompt completo (raciocínio + base de
 * conhecimento + material oficial recuperado + regras de encaminhamento) e o histórico,
 * e decide o que responder chamando as tools reais (registrar contato, buscar no
 * material oficial, encaminhar ao time jurídico, follow-up).
 *
 * Provedor ÚNICO: DeepSeek (DEEPSEEK_API_KEY). Sem chave — ou se a chamada ao LLM
 * falhar — cai no caminho determinístico de lib/agent/fallback.ts, que acolhe e
 * encaminha sem nunca afirmar informação migratória.
 */
export async function runAgent(params: {
  systemPrompt: string;
  history: AgentTurn[];
  conversationId: string;
  // Tools a NÃO oferecer nesta chamada (ex.: bloquear o encaminhamento na 1ª mensagem,
  // para a Ana acolher antes de despachar quem só mandou "oi").
  blockTools?: string[];
}): Promise<AgentRunResult> {
  if (useDeepseek) {
    try {
      // Import dinâmico evita ciclo (deepseek.ts importa tipos daqui).
      const { runDeepseek } = await import("@/lib/agent/deepseek");
      return { ...(await runDeepseek(params)), source: "deepseek" as const };
    } catch (err) {
      console.error(
        "[deepseek] falhou — caindo no atendimento determinístico:",
        err instanceof Error ? err.message : "erro desconhecido",
      );
    }
  }
  return {
    ...(await runFallback({ history: params.history, conversationId: params.conversationId })),
    source: "fallback" as const,
  };
}
