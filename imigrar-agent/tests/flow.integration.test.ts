import { describe, it, expect } from "vitest";
import { processMessage } from "@/lib/agent";
import { getRepository } from "@/lib/data";

describe("fluxo comercial integrado (menu-estrito)", () => {
  it("percorre S0→S1→S2→S3→S4 e chega no orçamento", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("flow-int:1");
    const r1 = await processMessage({ conversationId: conv.id, userText: "oi" });
    expect(r1.reply.toLowerCase()).toMatch(/nome/);
    await processMessage({ conversationId: conv.id, userText: "João Silva, CPF 111.444.777-35" });
    const r3 = await processMessage({ conversationId: conv.id, userText: "1" });
    expect(r3.reply.toLowerCase()).toMatch(/setor|comercial/);
    const r4 = await processMessage({ conversationId: conv.id, userText: "1" });
    expect(r4.reply.toLowerCase()).toMatch(/orçamento|consultor/);
    const r5 = await processMessage({ conversationId: conv.id, userText: "1" });
    expect(r5.reply.toLowerCase()).toMatch(/empresa|colaboradores|serviço/);
  });

  it("assunto trabalhista transfere com dossiê em qualquer ponto", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("flow-int:2");
    await processMessage({ conversationId: conv.id, userText: "oi" });
    const r = await processMessage({ conversationId: conv.id, userText: "tenho dúvida sobre demissão e férias" });
    expect(r.toolCalls?.some((t) => t.name === "transferir_para_humano")).toBe(true);
  });

  it("não revela custo/salário (guardrail)", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("flow-int:3");
    await processMessage({ conversationId: conv.id, userText: "oi" });
    const r = await processMessage({ conversationId: conv.id, userText: "qual o salário e o custo interno de vocês?" });
    expect(r.reply.toLowerCase()).not.toMatch(/1\.?851|salário base|margem/);
  });
});
