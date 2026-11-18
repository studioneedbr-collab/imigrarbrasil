import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Llm } from "@/lib/agent/llm";

// A RESERVA: o provedor que não foi escolhido assume quando o escolhido falha — e SÓ
// quando isso não repetiria um efeito que já aconteceu.

const llm = (provedor: "deepseek" | "openai"): Llm => ({
  provedor,
  nome: provedor,
  baseUrl: "http://nao-existe",
  key: "k",
  modelo: "m",
  configurado: true,
  origemDaChave: "ambiente",
});

const conduzir = vi.fn();
let disponiveis: Llm[] = [];

vi.mock("@/lib/agent/llm", () => ({ llmsDisponiveis: async () => disponiveis }));
vi.mock("@/lib/agent/conducao", () => ({ conduzirComLlm: (p: unknown) => conduzir(p) }));

const params = {
  systemPrompt: "s",
  history: [{ role: "user" as const, content: "oi" }],
  conversationId: "conversa-reserva",
};

describe("a reserva do provedor de LLM", () => {
  beforeEach(() => {
    conduzir.mockReset();
    disponiveis = [llm("openai"), llm("deepseek")];
  });

  it("responde pelo escolhido quando ele funciona, sem tocar na reserva", async () => {
    conduzir.mockResolvedValueOnce({ reply: "olá", toolCalls: [] });
    const { runAgent } = await import("@/lib/agent/runner");
    const r = await runAgent(params);
    expect(r).toMatchObject({ reply: "olá", source: "openai" });
    expect(conduzir).toHaveBeenCalledTimes(1);
  });

  it("o escolhido falha antes de qualquer tool: a reserva assume", async () => {
    conduzir
      .mockRejectedValueOnce(Object.assign(new Error("HTTP 401"), { toolsExecutadas: 0 }))
      .mockResolvedValueOnce({ reply: "da reserva", toolCalls: [] });
    const { runAgent } = await import("@/lib/agent/runner");
    const r = await runAgent(params);
    expect(r).toMatchObject({ reply: "da reserva", source: "deepseek" });
  });

  it("o escolhido falha DEPOIS de executar uma tool: não recomeça na reserva", async () => {
    // Recomeçar do zero encaminharia a pessoa duas vezes ao time jurídico.
    conduzir.mockRejectedValueOnce(Object.assign(new Error("caiu no meio"), { toolsExecutadas: 1 }));
    const { runAgent } = await import("@/lib/agent/runner");
    const r = await runAgent(params);
    expect(conduzir).toHaveBeenCalledTimes(1);
    expect(r.source).toBe("fallback");
  });

  it("os dois falham: o atendimento cai no determinístico", async () => {
    conduzir.mockRejectedValue(Object.assign(new Error("fora"), { toolsExecutadas: 0 }));
    const { runAgent } = await import("@/lib/agent/runner");
    const r = await runAgent(params);
    expect(conduzir).toHaveBeenCalledTimes(2);
    expect(r.source).toBe("fallback");
  });
});
