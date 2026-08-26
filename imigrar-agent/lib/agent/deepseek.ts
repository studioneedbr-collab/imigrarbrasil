import { env } from "@/lib/env";
import { AGENT_TOOLS, executeTool } from "@/lib/agent/tools";
import type { AgentTurn, AgentRunResult, ToolCallTrace } from "@/lib/agent/runner";

const MAX_TOOL_ITERATIONS = 6;

// Vai como PRIMEIRA linha do system prompt: mata o vazamento de raciocínio interno na
// resposta ao cliente (ex.: "já calculei", "vou apresentar o valor", "seguindo o fluxo").
// Exportado para o dump do prompt (tests/_prompt.manual.ts) — o que se testa no chat do
// DeepSeek tem que ser exatamente o que o app manda, incluindo esta primeira linha.
export const ABSOLUTE_RULE =
  "REGRA ABSOLUTA 1 — IDIOMA: responda SEMPRE no idioma em que a pessoa escreveu, e mantenha esse idioma até o fim da conversa, mesmo que o material de apoio esteja em português. Nunca comente o idioma dela nem diga que está traduzindo.\n" +
  "REGRA ABSOLUTA 2: nunca exponha seu raciocínio interno na resposta. Nunca escreva o que você 'vai fazer' ou 'já fez'. Simplesmente faça e responda de forma natural. Frases como 'vou verificar', 'já tenho os dados', 'seguindo o fluxo' NUNCA devem aparecer na mensagem enviada. A resposta é SÓ o que a pessoa leria no WhatsApp.";

// AGENT_TOOLS está no formato name/description/input_schema. O DeepSeek
// usa o formato OpenAI (type:"function" + function.parameters). Convertido uma vez.
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

async function chatCompletion(
  messages: OpenAIMessage[],
  tools: typeof OPENAI_TOOLS = OPENAI_TOOLS,
): Promise<OpenAIMessage> {
  const res = await fetch(`${env.deepseekBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.deepseekKey}`,
    },
    body: JSON.stringify({
      model: env.deepseekModel,
      messages,
      tools,
      tool_choice: "auto",
      max_tokens: 1024,
      temperature: 0.4,
    }),
  });
  if (!res.ok) {
    throw new Error(`DeepSeek chat failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: OpenAIMessage }[];
  };
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error("DeepSeek: resposta sem choices/message");
  return msg;
}

/**
 * DeepSeek conduz a conversa: recebe o system prompt completo (persona + base de
 * conhecimento + regras) e o histórico, e decide o que responder chamando as tools
 * reais (preço, proposta, registrar lead, transferir, follow-up). Mesmo contrato do
 * Único provedor de LLM. Se falhar, o chamador cai no engine determinístico.
 */
export async function runDeepseek({
  systemPrompt,
  history,
  conversationId,
  blockTools,
}: {
  systemPrompt: string;
  history: AgentTurn[];
  conversationId: string;
  blockTools?: string[];
}): Promise<AgentRunResult> {
  const toolCalls: ToolCallTrace[] = [];
  const tools = blockTools?.length
    ? OPENAI_TOOLS.filter((t) => !blockTools.includes(t.function.name))
    : OPENAI_TOOLS;
  const messages: OpenAIMessage[] = [
    { role: "system", content: `${ABSOLUTE_RULE}\n\n${systemPrompt}` },
    ...history.map((h) => ({ role: h.role, content: h.content })),
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const msg = await chatCompletion(messages, tools);

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
        result = await executeTool(call.function.name, input);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
      }
      toolCalls.push({ name: call.function.name, input, result });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  // Excedeu as iterações de tool — encaminha para uma pessoa finalizar.
  return {
    reply:
      "Deixa eu pedir para alguém do nosso time jurídico falar com você sobre isso. Continuo por aqui se precisar de mais alguma coisa.",
    toolCalls,
  };
}
