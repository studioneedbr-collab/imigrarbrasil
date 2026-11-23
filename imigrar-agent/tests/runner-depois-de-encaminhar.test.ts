import { describe, it, expect, vi } from "vitest";

// O MODELO CAI DEPOIS DE JÁ TER ENCAMINHADO: sai o aviso do encaminhamento, com as tools
// que rodaram — e não o atendimento determinístico, que encaminharia de novo ou faria uma
// pergunta de triagem a quem já foi passado ao time.

const transferencia = { name: "transferir_para_humano", input: {}, result: { ok: true, transferred: true } };

vi.mock("@/lib/agent/llm", () => ({
  llmsDisponiveis: async () => [{ provedor: "openai", nome: "ChatGPT", configurado: true }],
}));
vi.mock("@/lib/agent/conducao", async () => {
  class FalhaDoLlm extends Error {
    constructor(m: string, readonly toolsExecutadas: number, readonly toolCalls: unknown[] = []) {
      super(m);
    }
  }
  return {
    FalhaDoLlm,
    conduzirComLlm: async () => {
      throw new FalhaDoLlm("HTTP 500", 1, [transferencia]);
    },
  };
});

import { runAgent } from "@/lib/agent/runner";

describe("falha depois de encaminhar", () => {
  it("devolve o aviso e as tools que já rodaram", async () => {
    const r = await runAgent({
      systemPrompt: "P",
      history: [{ role: "user", content: "recebi notificação para sair do país" }],
      conversationId: "c-x",
      avisoDeEncaminhamento: "AVISO",
    });
    expect(r.reply).toBe("AVISO");
    expect(r.toolCalls).toEqual([transferencia]);
    expect(r.source).toBe("openai");
  });
});
