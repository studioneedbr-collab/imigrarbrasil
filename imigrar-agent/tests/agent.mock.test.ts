import { describe, it, expect } from "vitest";
import { processMessage } from "@/lib/agent";
import { getRepository } from "@/lib/data";

// Navega o funil guiado (S0→S5) e devolve a conversa posicionada no orçamento.
async function driveToOrcamento(number: string) {
  const repo = getRepository();
  const conv = await repo.getOrCreateConversation(number);
  await processMessage({ conversationId: conv.id, userText: "oi" }); // S0 → S1
  await processMessage({ conversationId: conv.id, userText: "Maria Silva, CPF 111.444.777-35" }); // S1 → S2
  await processMessage({ conversationId: conv.id, userText: "1" }); // cliente → S3
  await processMessage({ conversationId: conv.id, userText: "1" }); // comercial → S4
  await processMessage({ conversationId: conv.id, userText: "1" }); // orçamento → S5
  return conv;
}

describe("orquestrador (LLM mock) — fluxo guiado", () => {
  it("responde à primeira mensagem e persiste", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("sim:agent-1");
    const res = await processMessage({ conversationId: conv.id, userText: "Olá, preciso de limpeza" });
    expect(res.reply.length).toBeGreaterThan(0);
    const msgs = await repo.listMessages(conv.id);
    expect(msgs.some((m) => m.role === "assistant")).toBe(true);
  });

  it("aciona a tool de preço quando, no orçamento, pedem valor de ASG", async () => {
    const conv = await driveToOrcamento("sim:agent-2");
    const res = await processMessage({
      conversationId: conv.id,
      userText: "preciso de 2 auxiliares de serviços gerais",
    });
    expect(res.toolCalls.some((t) => t.name === "calcular_preco_servico")).toBe(true);
    expect(res.reply).toMatch(/R\$/);
  });
});
