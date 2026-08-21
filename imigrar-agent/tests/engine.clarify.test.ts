import { describe, it, expect } from "vitest";
import { processMessage } from "@/lib/agent";
import { getRepository } from "@/lib/data";

// Comportamento de clareza/escape: o agente não empurra o fluxo diante de resposta
// sem sentido, entende "não entendi/pode repetir" e permite falar com humano a qualquer hora.

async function driveToS5(id: string) {
  const repo = getRepository();
  const conv = await repo.getOrCreateConversation(id);
  await processMessage({ conversationId: conv.id, userText: "oi" }); // → S1
  await processMessage({ conversationId: conv.id, userText: "João Silva" }); // S1 → S2
  await processMessage({ conversationId: conv.id, userText: "1" }); // S2 → S3
  await processMessage({ conversationId: conv.id, userText: "1" }); // S3 → S4
  await processMessage({ conversationId: conv.id, userText: "1" }); // S4 → S5
  return conv;
}

describe("clareza e escape", () => {
  it("resposta sem sentido em S5 pede reformulação com exemplo (não empurra)", async () => {
    const conv = await driveToS5("clarify:1");
    const r = await processMessage({ conversationId: conv.id, userText: "kadksd" });
    expect(r.reply.toLowerCase()).toMatch(/não consegui identificar|exemplo|consultor/);
  });

  it("'falar com um consultor' transfere para humano", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("clarify:2");
    await processMessage({ conversationId: conv.id, userText: "oi" });
    const r = await processMessage({ conversationId: conv.id, userText: "quero falar com um consultor" });
    expect(r.toolCalls?.some((t) => t.name === "transferir_para_humano")).toBe(true);
  });

  it("'não entendi, pode repetir' reexplica sem travar", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("clarify:3");
    await processMessage({ conversationId: conv.id, userText: "oi" }); // → S1
    const r = await processMessage({ conversationId: conv.id, userText: "não entendi, pode repetir?" });
    expect(r.reply.toLowerCase()).toMatch(/explicar melhor|consultor|nome/);
  });
});
