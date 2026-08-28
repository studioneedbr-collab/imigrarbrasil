import { describe, it, expect } from "vitest";
import { COLUNAS, transicao } from "@/lib/fila/kanban";
import { valorEmReais } from "@/components/crm/movimento";
import { MOTIVOS_DE_PERDA } from "@/lib/domain/types";
import { MOTIVO_PERDA_LABEL, ATENDIMENTO_LABEL } from "@/lib/domain/rotulos";
import { CAMPOS_SO_DE_HUMANO, semCamposSoDeHumano } from "@/lib/data/prazo";

describe("a etapa onde o dinheiro aparece", () => {
  it("fica entre 'em atendimento' e 'reunião agendada'", () => {
    expect(COLUNAS.indexOf("proposta_enviada")).toBe(COLUNAS.indexOf("em_atendimento") + 1);
    expect(COLUNAS.indexOf("agendado")).toBe(COLUNAS.indexOf("proposta_enviada") + 1);
  });

  it("mover para lá exige a proposta — serviço, valor e validade", () => {
    expect(transicao("em_atendimento", "proposta_enviada")).toEqual({
      acao: "propor",
      exigeProposta: true,
    });
    // Também de "novo": nem todo caso passa por uma coluna intermediária antes do orçamento.
    expect(transicao("novo", "proposta_enviada")?.exigeProposta).toBe(true);
  });

  it("fechar exige dizer quanto foi contratado", () => {
    expect(transicao("proposta_enviada", "fechado")).toEqual({ acao: "fechar", exigeValor: true });
  });

  it("perder continua exigindo motivo", () => {
    expect(transicao("proposta_enviada", "perdido")?.exigeMotivo).toBe(true);
  });

  it("a proposta e os valores são de humano — o agente não escreve neles", () => {
    for (const campo of [
      "propostaValor",
      "propostaEnviadaEm",
      "propostaServico",
      "propostaValidade",
      "valorContratado",
      "motivoPerdaCategoria",
      "apoioIds",
    ]) {
      expect(CAMPOS_SO_DE_HUMANO).toContain(campo);
    }
    const limpo = semCamposSoDeHumano({ propostaValor: 3500, resumo: "x" });
    expect(limpo.propostaValor).toBeUndefined();
    expect(limpo.resumo).toBe("x");
  });

  it("toda coluna tem rótulo, inclusive a nova", () => {
    for (const c of COLUNAS) expect(ATENDIMENTO_LABEL[c]).toBeTruthy();
  });
});

describe("o motivo da perda", () => {
  it("é categoria fechada — texto livre não se soma", () => {
    expect(MOTIVOS_DE_PERDA).toEqual([
      "preco",
      "outro_escritorio",
      "resolveu_sozinho",
      "sumiu",
      "perfil_dpu",
      "fora_de_escopo",
    ]);
    for (const m of MOTIVOS_DE_PERDA) expect(MOTIVO_PERDA_LABEL[m]).toBeTruthy();
  });
});

describe("o valor digitado na tela", () => {
  it("aceita as três grafias que uma pessoa usa", () => {
    expect(valorEmReais("3.500,00")).toBe(3500);
    expect(valorEmReais("3500")).toBe(3500);
    expect(valorEmReais("R$ 1.250,50")).toBe(1250.5);
  });

  it("campo vazio ou lixo não vira zero — vira 'não informado'", () => {
    expect(valorEmReais("")).toBeNull();
    expect(valorEmReais("abc")).toBeNull();
  });
});
