import { describe, it, expect } from "vitest";
import { avaliarTransferencia } from "@/lib/agent/transfer-gate";

const base = { userTurns: 5, temNome: true, ultimaMensagem: "obrigado" };

describe("freio de encaminhamento", () => {
  it("segura na primeira mensagem, mesmo tocando num tema de outro setor", () => {
    const r = avaliarTransferencia({
      userTurns: 1,
      temNome: false,
      ultimaMensagem: "preciso falar sobre o contrato e uma reclamação do porteiro",
    });
    expect(r.liberado).toBe(false);
  });

  it("segura enquanto ela não souber com quem está falando", () => {
    const r = avaliarTransferencia({
      userTurns: 4,
      temNome: false,
      ultimaMensagem: "quero saber das minhas férias",
    });
    expect(r.liberado).toBe(false);
    expect(r.motivo).toMatch(/quem/);
  });

  it("libera depois do atendimento mínimo", () => {
    expect(avaliarTransferencia({ ...base, ultimaMensagem: "quero cancelar o contrato" }).liberado).toBe(
      true,
    );
  });

  it("emergência passa na primeira mensagem", () => {
    const r = avaliarTransferencia({
      userTurns: 1,
      temNome: false,
      ultimaMensagem: "houve um acidente aqui no prédio agora",
    });
    expect(r.liberado).toBe(true);
    expect(r.motivo).toBe("emergência");
  });

  it("pedido explícito por uma pessoa passa na primeira mensagem", () => {
    for (const msg of [
      "quero falar com um atendente",
      "me transfere para o responsável",
      "quero falar com uma pessoa de verdade",
      "isso é robô?",
    ]) {
      expect(avaliarTransferencia({ userTurns: 1, temNome: false, ultimaMensagem: msg }).liberado).toBe(
        true,
      );
    }
  });

  it("pedido comercial comum não vira emergência nem pedido de humano", () => {
    expect(
      avaliarTransferencia({ userTurns: 1, temNome: false, ultimaMensagem: "preciso de 3 porteiros na Barra" })
        .liberado,
    ).toBe(false);
  });
});
