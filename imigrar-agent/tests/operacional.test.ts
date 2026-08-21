import { describe, it, expect } from "vitest";
import { processMessage } from "@/lib/agent";
import { getRepository } from "@/lib/data";

async function toS3(id: string) {
  const repo = getRepository();
  const conv = await repo.getOrCreateConversation(id);
  await processMessage({ conversationId: conv.id, userText: "oi" }); // → S1
  await processMessage({ conversationId: conv.id, userText: "João Silva" }); // → S2
  await processMessage({ conversationId: conv.id, userText: "1" }); // Cliente → S3
  return conv;
}

describe("ramo Operacional (S9)", () => {
  it("Cliente → Operacional abre o menu operacional", async () => {
    const conv = await toS3("op:1");
    const r = await processMessage({ conversationId: conv.id, userText: "2" }); // Operacional
    expect(r.reply.toLowerCase()).toMatch(/ocorrência|apoio operacional|acompanhar|supervisor/);
  });

  it("opção 1–3 registra e encaminha ao operacional", async () => {
    const conv = await toS3("op:2");
    await processMessage({ conversationId: conv.id, userText: "2" }); // → S9
    const r = await processMessage({ conversationId: conv.id, userText: "1" }); // registrar ocorrência
    expect(r.reply.toLowerCase()).toMatch(/registrei|encaminhei|operacional/);
  });

  it("opção 4 transfere para um supervisor", async () => {
    const conv = await toS3("op:3");
    await processMessage({ conversationId: conv.id, userText: "2" }); // → S9
    const r = await processMessage({ conversationId: conv.id, userText: "4" });
    expect(r.toolCalls?.some((t) => t.name === "transferir_para_humano")).toBe(true);
  });
});
