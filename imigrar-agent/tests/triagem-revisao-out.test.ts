// CASOS REAIS QUE A TRIAGEM LIA ERRADO — revisão de outubro/2026.
//
// Cada um destes mudava o rumo do atendimento: um "I'm fine" virava multa e lead
// prioritário, quem estava na Venezuela era tratado como quem já está no Brasil, e quem
// queria denunciar o patrão era silenciado como se tivesse pedido para parar.

import { describe, it, expect } from "vitest";
import { detectarSinalDePrazo } from "@/lib/agent/classificacao";
import { CASO_JURIDICO } from "@/lib/agent/transfer-gate";
import { detectarOndeEsta } from "@/lib/agent/triagem";
import { detectarOptOut } from "@/lib/agent/opt-out";
import { runFallback } from "@/lib/agent/fallback";
import { getRepository } from "@/lib/data";

describe("prazo processual não é relógio", () => {
  it.each([
    "Hi, I'm fine thanks. I want to study in Brazil",
    "meu passaporte vence em 60 dias",
    "tenho 20 dias até começar o contrato",
    "qual o prazo de validade do visto de estudante?",
  ])("%s → sem prazo", (t) => {
    expect(detectarSinalDePrazo(t).temPrazo).toBe(false);
  });

  it.each([
    "I got fined at the airport",
    "tenho um prazo que vence essa semana",
    "tenho 10 dias para recorrer",
  ])("%s → prazo", (t) => {
    expect(detectarSinalDePrazo(t).temPrazo).toBe(true);
  });

  it("'não tenho recursos' e a pergunta de validade não são caso jurídico", () => {
    expect(CASO_JURIDICO.test("não tenho recursos para pagar")).toBe(false);
    expect(CASO_JURIDICO.test("qual o prazo de validade do visto de estudante?")).toBe(false);
    expect(CASO_JURIDICO.test("meu visto venceu faz três meses")).toBe(true);
  });
});

describe("onde a pessoa está", () => {
  it.each([
    "Estou na Venezuela e quero ir morar no Brasil",
    "I'm in Nigeria and I want to work in Brazil",
    "Soy boliviana, estoy en La Paz y quiero estudiar en Brasil",
  ])("%s → não é Brasil", (t) => {
    expect(detectarOndeEsta(t) ?? "").not.toMatch(/^Brasil/);
  });

  it.each([
    ["Estou no Brasil há dois anos", "Brasil"],
    ["moro aqui no Brasil", "Brasil"],
    ["moro em Boa Vista", "Brasil — Boa Vista"],
  ])("%s → %s", (t, esperado) => {
    expect(detectarOndeEsta(t)).toBe(esperado);
  });
});

describe("pedido de parar é sobre nós", () => {
  it.each([
    "vou denunciar meu patrão, ele pegou meu passaporte",
    "não quero receber outra multa da PF",
    "preciso tirar meu nome da lista de impedidos",
  ])("%s → continua o atendimento", (t) => {
    expect(detectarOptOut(t)).toBeNull();
  });

  it.each([
    "vou denunciar vocês",
    "vou te bloquear",
    "não quero receber mensagens",
    "me tira dessa lista",
    "quero ser removido da lista",
  ])("%s → bloquear", (t) => {
    expect(detectarOptOut(t)).toBe("bloquear");
  });
});

describe("motor de reserva", () => {
  it("risco à pessoa vence o 'não tenho como pagar'", async () => {
    const repo = getRepository();
    const c = await repo.getOrCreateConversation(`55119${Math.floor(Math.random() * 1e8)}`, "Teste");
    const history = [
      { role: "user", content: "oi" },
      { role: "assistant", content: "Olá! Como posso ajudar?" },
      { role: "user", content: "não tenho dinheiro para advogado" },
      { role: "assistant", content: "Entendo." },
      { role: "user", content: "socorro, estão me ameaçando de morte aqui em Boa Vista" },
    ] as const;
    for (const h of history) await repo.addMessage(c.id, h.role, h.content);
    const out = await runFallback({ history: history as never, conversationId: c.id });
    expect(out.toolCalls.map((t) => t.name)).toContain("transferir_para_humano");
  });
});
