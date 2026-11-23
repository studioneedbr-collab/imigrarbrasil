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
  source?: "deepseek" | "openai" | "fallback";
}

/**
 * Um LLM CONDUZ a conversa — recebe o system prompt completo (raciocínio + base de
 * conhecimento + material oficial recuperado + regras de encaminhamento) e o histórico,
 * e decide o que responder chamando as tools reais (registrar contato, buscar no
 * material oficial, encaminhar ao time jurídico, follow-up).
 *
 * O provedor é o escolhido no painel (Integrações → lib/agent/llm.ts): DeepSeek ou
 * ChatGPT. Se ele falhar e o outro tiver credencial, o outro assume. Sem nenhum — ou se
 * os dois falharem — cai no caminho determinístico de lib/agent/fallback.ts, que acolhe
 * e encaminha sem nunca afirmar informação migratória.
 */
export async function runAgent(params: {
  systemPrompt: string;
  history: AgentTurn[];
  conversationId: string;
  // Tools a NÃO oferecer nesta chamada (ex.: bloquear o encaminhamento na 1ª mensagem,
  // para a Ana acolher antes de despachar quem só mandou "oi").
  blockTools?: string[];
  /**
   * MODO SOMBRA. Desce daqui até `executeTool`, e é isso que impede o ensaio de mandar
   * WhatsApp para o advogado e de agendar follow-up para a pessoa. O flag existia em
   * `respondToConversation` e parava lá — as tools rodavam para valer.
   */
  sombra?: boolean;
  /** Ver `conduzirComLlm`: vai depois do histórico. O motor determinístico não o usa. */
  estadoDoTurno?: string;
}): Promise<AgentRunResult> {
  // Imports dinâmicos evitam ciclo (conducao.ts importa tipos daqui).
  const { llmsDisponiveis } = await import("@/lib/agent/llm");
  const llms = await llmsDisponiveis();

  for (const [posicao, llm] of llms.entries()) {
    try {
      const { conduzirComLlm } = await import("@/lib/agent/conducao");
      return { ...(await conduzirComLlm({ ...params, llm })), source: llm.provedor };
    } catch (err) {
      const motivo = err instanceof Error ? err.message : "erro desconhecido";
      const proximo = llms[posicao + 1];
      // SÓ PASSA PARA A RESERVA SE NADA ACONTECEU AINDA. Uma condução que já executou
      // uma tool (encaminhou, agendou follow-up) e caiu depois não pode recomeçar do zero
      // em outro provedor: ele encaminharia de novo. Aí o caminho é o determinístico.
      const toolsExecutadas =
        typeof (err as { toolsExecutadas?: unknown }).toolsExecutadas === "number"
          ? (err as { toolsExecutadas: number }).toolsExecutadas
          : 0;
      const vaiParaReserva = Boolean(proximo) && toolsExecutadas === 0;
      console.error(
        `[${llm.provedor}] falhou — ${vaiParaReserva ? `tentando ${proximo.provedor}` : "caindo no atendimento determinístico"}:`,
        motivo,
      );
      // A QUEDA É ELEGANTE, E É JUSTAMENTE POR ISSO QUE PRECISA APARECER.
      //
      // Cair na reserva — ou no motor determinístico — salva o atendimento daquela
      // mensagem, mas de fora não dá para notar: a pessoa recebe resposta, o painel
      // mostra a conversa andando. Registrado, isso vira um número na saúde da operação
      // em vez de uma degradação silenciosa que ninguém liga com "o agente está estranho
      // hoje". A falha do ESCOLHIDO é registrada mesmo quando a reserva salva.
      try {
        const { getRepository } = await import("@/lib/data");
        await getRepository().registrarEventoOperacao({
          tipo: "llm_falhou",
          conversationId: params.conversationId,
          detalhe: `${llm.nome}${vaiParaReserva ? ` (assumiu: ${proximo.nome})` : ""}: ${motivo}`.slice(0, 500),
        });
      } catch {
        // Registrar a falha não pode virar uma segunda falha.
      }
      if (!vaiParaReserva) break;
    }
  }
  return {
    ...(await runFallback({
      history: params.history,
      conversationId: params.conversationId,
      sombra: params.sombra,
    })),
    source: "fallback" as const,
  };
}
