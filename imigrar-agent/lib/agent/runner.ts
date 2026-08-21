import { useDeepseek } from "@/lib/env";
import { runEngine } from "@/lib/agent/flow/engine";

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
  /** Quem escreveu a resposta. O engine determinístico REPETE menus de propósito quando
   *  não entende a opção, então a rede anti-repetição só vale para o modelo. */
  source?: "deepseek" | "engine";
}

/**
 * Um LLM CONDUZ a conversa — recebe o system prompt completo (persona + base de
 * conhecimento + objeções + regras de transferência + briefing) e o histórico, e
 * decide o que responder chamando as tools reais (preço, proposta, registrar lead,
 * transferir, follow-up).
 *
 * Provedor ÚNICO: DeepSeek (DEEPSEEK_API_KEY). Sem chave — ou se a chamada ao LLM
 * falhar — cai no engine determinístico (máquina de estados), que nunca deixa o
 * atendimento sem resposta.
 */
export async function runAgent(params: {
  systemPrompt: string;
  history: AgentTurn[];
  conversationId: string;
  // Tools a NÃO oferecer nesta chamada (ex.: bloquear preço/proposta na 1ª mensagem,
  // forçando a Shayene a cumprimentar e qualificar antes de cotar).
  blockTools?: string[];
}): Promise<AgentRunResult> {
  if (useDeepseek) {
    try {
      // Import dinâmico evita ciclo (deepseek.ts importa tipos daqui).
      const { runDeepseek } = await import("@/lib/agent/deepseek");
      return { ...(await runDeepseek(params)), source: "deepseek" as const };
    } catch (err) {
      console.error(
        "[deepseek] falhou — caindo no engine determinístico:",
        err instanceof Error ? err.message : "erro desconhecido",
      );
    }
  }
  return {
    ...(await runEngine({ history: params.history, conversationId: params.conversationId })),
    source: "engine" as const,
  };
}
