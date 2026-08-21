import { describe, it, expect } from "vitest";
import { processMessage } from "@/lib/agent";
import { getRepository } from "@/lib/data";

// Ramo Funcionário (setor interno): S2 opção 2 → S10 (Departamento Pessoal / RH).
async function toFuncionario(id: string) {
  const repo = getRepository();
  const conv = await repo.getOrCreateConversation(id);
  await processMessage({ conversationId: conv.id, userText: "oi" }); // → S1
  await processMessage({ conversationId: conv.id, userText: "Maria Silva" }); // S1 → S2
  await processMessage({ conversationId: conv.id, userText: "2" }); // Funcionário → S10
  return conv;
}

describe("setor interno / Funcionário (S10)", () => {
  it("Funcionário abre o menu Departamento Pessoal / RH", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("rh:0");
    await processMessage({ conversationId: conv.id, userText: "oi" });
    await processMessage({ conversationId: conv.id, userText: "Maria Silva" });
    const r = await processMessage({ conversationId: conv.id, userText: "2" });
    expect(r.reply.toLowerCase()).toMatch(/departamento pessoal|recursos humanos/);
  });

  it("opção 1 encaminha ao Departamento Pessoal", async () => {
    const conv = await toFuncionario("rh:1");
    const r = await processMessage({ conversationId: conv.id, userText: "1" });
    expect(r.reply.toLowerCase()).toMatch(/departamento pessoal|encaminhei/);
  });

  it("opção 2 encaminha ao RH", async () => {
    const conv = await toFuncionario("rh:2");
    const r = await processMessage({ conversationId: conv.id, userText: "2" });
    expect(r.reply.toLowerCase()).toMatch(/rh|recursos humanos|encaminhei/);
  });
});
