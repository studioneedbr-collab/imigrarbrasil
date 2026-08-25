import { describe, it, expect } from "vitest";
import { avaliarTransferencia } from "@/lib/agent/transfer-gate";

const base = { userTurns: 5, temNome: true, ultimaMensagem: "obrigado" };

// O portão mudou de sentido com o domínio. Numa assessoria de imigração, encaminhar é o
// desenho do serviço: o que se segura é só o reflexo de despachar quem mandou um "oi".
describe("freio de encaminhamento", () => {
  it("segura a primeira mensagem quando não há sinal nenhum de caso", () => {
    const r = avaliarTransferencia({
      userTurns: 1,
      temNome: false,
      ultimaMensagem: "oi, tudo bem?",
    });
    expect(r.liberado).toBe(false);
  });

  it("NÃO exige saber o nome — quem está com medo pede ajuda antes de se apresentar", () => {
    const r = avaliarTransferencia({
      userTurns: 4,
      temNome: false,
      ultimaMensagem: "queria entender melhor como funciona",
    });
    expect(r.liberado).toBe(true);
  });

  it("libera depois do atendimento mínimo", () => {
    expect(
      avaliarTransferencia({ ...base, ultimaMensagem: "queria falar sobre a minha residência" })
        .liberado,
    ).toBe(true);
  });

  it("risco à pessoa passa na primeira mensagem", () => {
    const r = avaliarTransferencia({
      userTurns: 1,
      temNome: false,
      ultimaMensagem: "estou sendo ameaçado, saí do meu país fugindo",
    });
    expect(r.liberado).toBe(true);
    expect(r.motivo).toBe("risco à pessoa");
  });

  it("caso concreto do domínio passa na primeira mensagem, sem nome nenhum", () => {
    for (const msg of [
      "meu visto venceu faz três meses",
      "recebi uma exigência e o prazo está correndo",
      "preciso solicitar refúgio",
      "quanto custa para vocês cuidarem disso?",
    ]) {
      const r = avaliarTransferencia({ userTurns: 1, temNome: false, ultimaMensagem: msg });
      expect(r.liberado, msg).toBe(true);
    }
  });

  it("pedido explícito por uma pessoa (ou por um advogado) passa na primeira mensagem", () => {
    for (const msg of [
      "quero falar com um atendente",
      "quero falar com um advogado",
      "me transfere para o responsável",
      "isso é robô?",
    ]) {
      expect(
        avaliarTransferencia({ userTurns: 1, temNome: false, ultimaMensagem: msg }).liberado,
        msg,
      ).toBe(true);
    }
  });

  it("dúvida geral na primeira mensagem não vira transbordo automático", () => {
    expect(
      avaliarTransferencia({
        userTurns: 1,
        temNome: false,
        ultimaMensagem: "vocês ajudam com naturalização?",
      }).liberado,
    ).toBe(false);
  });
});
