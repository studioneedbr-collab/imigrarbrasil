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
      const motivo = err instanceof Error ? err.message : "erro desconhecido";
      console.error("[deepseek] falhou — caindo no atendimento determinístico:", motivo);
      // A QUEDA É ELEGANTE, E É JUSTAMENTE POR ISSO QUE PRECISA APARECER.
      //
      // Cair no motor determinístico salva o atendimento daquela mensagem, mas rebaixa
      // a Ana a um menu — o "chatbot" que este projeto existe para não ser. De fora não
      // dá para notar: a pessoa recebe resposta, o painel mostra a conversa andando.
      // Registrado, isso vira um número na saúde da operação em vez de uma degradação
      // silenciosa que ninguém liga com "o agente está estranho hoje".
      try {
        const { getRepository } = await import("@/lib/data");
        await getRepository().registrarEventoOperacao({
          tipo: "llm_falhou",
          conversationId: params.conversationId,
          detalhe: motivo.slice(0, 500),
        });
      } catch {
        // Registrar a falha não pode virar uma segunda falha.
      }
    }
  }
  return {
    ...(await runFallback({ history: params.history, conversationId: params.conversationId })),
    source: "fallback" as const,
  };
}
