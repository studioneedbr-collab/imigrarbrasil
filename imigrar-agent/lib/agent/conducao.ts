import { chamarChat, type Llm } from "@/lib/agent/llm";
import { registrarChamada, tokensDe, type UsoDeTokens } from "@/lib/custos/registro";
import { AGENT_TOOLS, executeTool } from "@/lib/agent/tools";
import type { AgentTurn, AgentRunResult, ToolCallTrace } from "@/lib/agent/runner";

const MAX_TOOL_ITERATIONS = 6;

/**
 * A falha de uma condução, com o que o chamador precisa para decidir se pode tentar de
 * novo em outro provedor: se alguma tool JÁ RODOU, repetir a conversa do zero repetiria
 * o efeito dela (um encaminhamento, um follow-up agendado).
 */
export class FalhaDoLlm extends Error {
  constructor(
    mensagem: string,
    readonly toolsExecutadas: number,
    /** As tools que JÁ rodaram — um encaminhamento feito não pode sumir com a falha. */
    readonly toolCalls: ToolCallTrace[] = [],
  ) {
    super(mensagem);
    this.name = "FalhaDoLlm";
  }
}

// Vai como PRIMEIRA linha do system prompt: mata o vazamento de raciocínio interno na
// resposta ao cliente (ex.: "já calculei", "vou apresentar o valor", "seguindo o fluxo").
// Exportado para o dump do prompt (tests/_prompt.manual.ts) — o que se testa no chat do
// DeepSeek tem que ser exatamente o que o app manda, incluindo esta primeira linha.
export const ABSOLUTE_RULE =
  "REGRA ABSOLUTA 1 — IDIOMA: responda SEMPRE no idioma em que a pessoa escreveu, e mantenha esse idioma até o fim da conversa, mesmo que o material de apoio esteja em português. Nunca comente o idioma dela nem diga que está traduzindo.\n" +
  "REGRA ABSOLUTA 2: nunca exponha seu raciocínio interno na resposta. Nunca escreva o que você 'vai fazer' ou 'já fez'. Simplesmente faça e responda de forma natural. Frases como 'vou verificar', 'já tenho os dados', 'seguindo o fluxo' NUNCA devem aparecer na mensagem enviada. A resposta é SÓ o que a pessoa leria no WhatsApp.";

// AGENT_TOOLS está no formato name/description/input_schema. Os dois provedores usam o
// formato OpenAI (type:"function" + function.parameters). Convertido uma vez.
const OPENAI_TOOLS = AGENT_TOOLS.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

/** Menos do que isto até o prazo do turno não vale começar uma chamada: não dá tempo. */
const FOLGA_MINIMA_MS = 3000;

async function chatCompletion(
  llm: Llm,
  messages: OpenAIMessage[],
  tools: typeof OPENAI_TOOLS = OPENAI_TOOLS,
  conversationId?: string,
  prazo?: number,
): Promise<OpenAIMessage> {
  // CADA ITERAÇÃO É UMA CHAMADA COBRADA. Uma resposta que usou três tools custou quatro
  // chamadas, e é assim que ela precisa aparecer no custo por conversa — contabilizar só
  // a última faria uma conversa cara parecer barata exatamente quando ela mais trabalha.
  const inicio = Date.now();
  const contabilizar = (uso: UsoDeTokens | undefined, ok: boolean, erro?: string) => {
    const { entrada, saida } = tokensDe(uso);
    void registrarChamada({
      provedor: llm.provedor,
      modelo: llm.modelo,
      tipo: "redacao",
      conversationId,
      tokensEntrada: entrada,
      tokensSaida: saida,
      duracaoMs: Date.now() - inicio,
      ok,
      erro,
    });
  };

  const resta = prazo ? prazo - Date.now() : undefined;
  if (resta !== undefined && resta < FOLGA_MINIMA_MS) {
    throw new Error(`${llm.nome}: sem tempo para mais uma chamada neste turno`);
  }
  let res: Response;
  try {
    res = await chamarChat(llm, { messages, tools, maxTokens: 1024, temperature: 0.4, timeoutMs: resta });
  } catch (err) {
    contabilizar(undefined, false, err instanceof Error ? err.message : "rede");
    throw err;
  }
  if (!res.ok) {
    const corpo = await res.text();
    contabilizar(undefined, false, `HTTP ${res.status}`);
    throw new Error(`${llm.nome} chat failed: ${res.status} ${corpo}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: OpenAIMessage }[];
    usage?: UsoDeTokens;
  };
  const msg = data.choices?.[0]?.message;
  contabilizar(data.usage, Boolean(msg), msg ? undefined : "resposta sem choices/message");
  if (!msg) throw new Error(`${llm.nome}: resposta sem choices/message`);
  return msg;
}

const MARCA_DA_NOTA = "NOTA INTERNA DO ATENDIMENTO";
const MARCA_FALSIFICADA = /nota\s+interna(\s+do\s+atendimento)?|estado\s+desta\s+conversa/gi;

/**
 * Tira da resposta qualquer linha que cite a nota interna. Ela vai colada na fala da
 * pessoa, e um modelo que a repete entrega como o atendimento funciona por dentro.
 */
export function semNotaInterna(resposta: string): string {
  const limpa = resposta
    .split("\n")
    .filter((linha) => !/nota interna|estado desta conversa|n[ãa]o foi a pessoa que escreveu/i.test(linha))
    .join("\n")
    .trim();
  return limpa || resposta;
}

/**
 * O histórico com a nota do turno colada na última fala da pessoa. Se a última mensagem
 * não for dela (não deveria acontecer num turno de resposta), a nota vai como `system`
 * no fim — melhor do que se perder.
 */
export function comNotaNaUltimaFala(
  history: AgentTurn[],
  nota?: string,
): { role: "user" | "assistant" | "system"; content: string }[] {
  const msgs = history.map((h) => ({ role: h.role as "user" | "assistant" | "system", content: h.content }));
  const texto = nota?.trim();
  if (!texto) return msgs;
  const ultima = msgs[msgs.length - 1];
  const bloco = `[${MARCA_DA_NOTA} — não foi a pessoa que escreveu isto, não a mencione e responda no idioma dela]\n${texto}`;
  if (ultima?.role === "user") {
    // Quem escreve o cabeçalho da nota na própria mensagem não ganha a autoridade dela.
    const dela = ultima.content.replace(MARCA_FALSIFICADA, "(texto da pessoa)");
    msgs[msgs.length - 1] = { ...ultima, content: `${dela}\n\n${bloco}` };
  } else {
    msgs.push({ role: "system", content: bloco });
  }
  return msgs;
}

/**
 * O modelo conduz a conversa: recebe o system prompt completo (persona + base de
 * conhecimento + regras) e o histórico, e decide o que responder chamando as tools
 * reais (registrar lead, transferir, follow-up). O provedor vem de fora (`llm`) — este
 * arquivo não sabe qual é, e é por isso que trocar no painel não muda nada aqui.
 *
 * Se falhar, lança `FalhaDoLlm`; o chamador decide entre a reserva e o determinístico.
 */
export async function conduzirComLlm({
  llm,
  systemPrompt,
  history,
  conversationId,
  blockTools,
  sombra,
  estadoDoTurno,
  prazo,
}: {
  llm: Llm;
  systemPrompt: string;
  history: AgentTurn[];
  conversationId: string;
  blockTools?: string[];
  /** Modo sombra: as tools são avaliadas, mas nada que saia do sistema acontece. */
  sombra?: boolean;
  /**
   * O que vale para ESTE turno (o que ela já respondeu, o que ainda falta), enviado
   * DEPOIS do histórico. No fim do system prompt de ~20 mil tokens isso ficava enterrado
   * longe da conversa, e o modelo lia a regra geral de abertura com mais força do que o
   * fato de que a pessoa já tinha respondido. Perto da última mensagem, ele lê por último.
   *
   * VAI DENTRO DA ÚLTIMA MENSAGEM DA PESSOA, marcado como nota interna, e não como uma
   * mensagem `system` solta. O modelo de conversa do DeepSeek junta todas as mensagens
   * `system` no começo do prompt — a nota voltaria exatamente para o lugar onde estava
   * enterrada. Dentro da última fala ela fica onde precisa ficar, nos dois provedores.
   */
  estadoDoTurno?: string;
  /**
   * Até quando (epoch ms) este turno pode esperar o modelo. Cada chamada recebe só o que
   * sobra — sem isto, o teto de 30 s valia POR chamada, e uma condução com tools mais a
   * reserva passava dos 60 s do webhook: a função morria e nada era enviado.
   */
  prazo?: number;
}): Promise<AgentRunResult> {
  const toolCalls: ToolCallTrace[] = [];
  const tools = blockTools?.length
    ? OPENAI_TOOLS.filter((t) => !blockTools.includes(t.function.name))
    : OPENAI_TOOLS;
  const messages: OpenAIMessage[] = [
    { role: "system", content: `${ABSOLUTE_RULE}\n\n${systemPrompt}` },
    ...comNotaNaUltimaFala(history, estadoDoTurno),
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    let msg: OpenAIMessage;
    try {
      msg = await chatCompletion(llm, messages, tools, conversationId, prazo);
    } catch (err) {
      throw new FalhaDoLlm(err instanceof Error ? err.message : String(err), toolCalls.length, [...toolCalls]);
    }

    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) {
      return { reply: (msg.content ?? "").trim() || "Desculpe, pode repetir?", toolCalls };
    }

    // Registra a mensagem do assistente (com os tool_calls) antes das respostas.
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });

    for (const call of calls) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
      } catch {
        parsed = {};
      }
      // Injeta o conversation_id em toda tool (as schemas o exigem).
      const input = { ...parsed, conversation_id: conversationId };
      let result: unknown;
      try {
        result = await executeTool(call.function.name, input, { sombra });
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
      }
      toolCalls.push({ name: call.function.name, input, result });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  // Excedeu as iterações de tool. A frase fixa que saía aqui prometia o time jurídico sem
  // ninguém ter sido chamado, em português fosse qual fosse a conversa. Agora o modelo
  // escreve a resposta com o que já tem, sem tools; se nem isso sair, é uma falha — e quem
  // chamou sabe o que fazer com ela (inclusive avisar um encaminhamento já feito).
  let final: OpenAIMessage;
  try {
    final = await chatCompletion(llm, messages, [], conversationId, prazo);
  } catch (err) {
    throw new FalhaDoLlm(err instanceof Error ? err.message : String(err), toolCalls.length, [...toolCalls]);
  }
  const texto = (final.content ?? "").trim();
  if (!texto) throw new FalhaDoLlm("excedeu as chamadas de ferramenta sem responder", toolCalls.length, [...toolCalls]);
  return { reply: texto, toolCalls };
}
