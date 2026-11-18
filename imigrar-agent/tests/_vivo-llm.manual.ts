// Verificação manual: o provedor escolhido aceita o corpo de verdade (com as tools)?
// Não toca no banco: só a chamada HTTP. Rodar com as variáveis do provedor no ambiente.
import { AGENT_TOOLS } from "@/lib/agent/tools";
import { chamarChat, montarLlm } from "@/lib/agent/llm";

async function main() {
  const qual = (process.argv[2] ?? "deepseek") as "deepseek" | "openai";
  const llm = montarLlm(qual, {});
  if (!llm.configurado) { console.log(`${qual}: SEM CHAVE no ambiente — não testado`); return; }
  const tools = AGENT_TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  const t0 = Date.now();
  const res = await chamarChat(llm, { messages: [{ role: "system", content: "Responda em uma palavra." }, { role: "user", content: "oi" }], tools, maxTokens: 20, temperature: 0.4 });
  const corpo = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string; tool_calls?: unknown[] } }[]; error?: { message?: string } };
  console.log(`${qual} (${llm.modelo}): HTTP ${res.status} em ${Date.now() - t0} ms ·`, res.ok ? JSON.stringify(corpo.choices?.[0]?.message).slice(0, 160) : corpo.error?.message?.slice(0, 200));
}
main();
