import { describe, it, expect } from "vitest";

// CHEGOU MENSAGEM NOVA ENQUANTO A AGENTE ESCREVIA. A resposta velha não sai nem entra no
// histórico: quem responde é o turno da mensagem nova, que lê as duas.

import { respondToConversation, buildDadosConhecidosBlock } from "@/lib/agent";
import { getRepository } from "@/lib/data";
import type { Lead } from "@/lib/domain/types";

const repo = getRepository();

describe("resposta que ficou velha durante a geração", () => {
  it("não é gravada no histórico e volta marcada como descartada", async () => {
    const c = await repo.getOrCreateConversation("5511966660001", "Angelo");
    await repo.addMessage(c.id, "user", "Sou português", "msg-1");

    const r = await respondToConversation(c.id, { aindaVale: async () => false });
    expect(r.descartada).toBe(true);
    expect((await repo.listMessages(c.id)).filter((m) => m.role === "assistant")).toHaveLength(0);
  });

  it("quando ainda vale, a resposta é gravada como sempre", async () => {
    const c = await repo.getOrCreateConversation("5511966660002", "Angelo");
    await repo.addMessage(c.id, "user", "Sou português", "msg-1");

    const r = await respondToConversation(c.id, { aindaVale: async () => true });
    expect(r.descartada).toBeUndefined();
    const dela = (await repo.listMessages(c.id)).filter((m) => m.role === "assistant");
    expect(dela).toHaveLength(1);
    expect(dela[0].content).toBe(r.reply);
  });

  it("se a conferência falhar, a resposta sai: calar por erro seria pior", async () => {
    const c = await repo.getOrCreateConversation("5511966660003", "Angelo");
    await repo.addMessage(c.id, "user", "Olá", "msg-1");
    const r = await respondToConversation(c.id, {
      aindaVale: async () => {
        throw new Error("banco fora");
      },
    });
    expect(r.descartada).toBeUndefined();
    expect((await repo.listMessages(c.id)).some((m) => m.role === "assistant")).toBe(true);
  });
});

describe("dados já conhecidos", () => {
  it("manda usar como fato, e proíbe pedir confirmação", () => {
    const bloco = buildDadosConhecidosBlock({ nacionalidade: "portuguesa", localizacao: "exterior", paisExterior: "Suíça" } as Lead);
    expect(bloco).toContain("Suíça");
    expect(bloco).toContain("NÃO peça confirmação");
    expect(bloco).not.toContain("(confirme,");
  });
});
