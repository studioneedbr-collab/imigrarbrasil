import { describe, it, expect } from "vitest";
import { BDI, calcularPreco, POSTOS_MINIMOS_MATERIAL } from "@/lib/comercial/pricing";
import { COBERTURAS, detectarCobertura, dimensionar, descreverPosto } from "@/lib/comercial/dimensionamento";
import { abasDoPosto } from "@/lib/planilha/composicao";

/**
 * A REGRA DO EDUARDO, em número (17/08/2026):
 *
 *   "1 Posto 24h significa 4 funcionários na escala 12x36 onde dois recebem adicional
 *    noturno. 2 postos 24h significa 8 funcionários na escala 12x36 onde 4 recebem
 *    adicional noturno."
 *
 * O teste do Pedro que originou isto cotou um posto de 24h como 2 porteiros, sem adicional
 * noturno nenhum — metade da mão de obra e sem o adicional da noite.
 */
describe("dimensionamento de posto por cobertura", () => {
  it("1 posto 24h = 4 funcionários na 12x36, 2 com adicional noturno", () => {
    const d = dimensionar("24h");
    expect(d.funcionariosPorPosto).toBe(4);
    expect(d.turnos.reduce((s, t) => s + t.funcionariosPorPosto, 0)).toBe(4);
    expect(d.turnos.filter((t) => t.noturno).reduce((s, t) => s + t.funcionariosPorPosto, 0)).toBe(2);
  });

  it("2 postos 24h = 8 funcionários, 4 com adicional noturno", () => {
    const r = calcularPreco({ serviceName: "Porteiro", employeesCount: 2, schedule: "12x36", cobertura: "24h" });
    expect(r.funcionariosTotais).toBe(8);
    const noturnos = r.turnos!.filter((t) => t.noturno).reduce((s, t) => s + t.funcionarios, 0);
    expect(noturnos * 2).toBe(4); // 2 por posto × 2 postos
    expect(descreverPosto(dimensionar("24h"), 2)).toContain("8 funcionários");
    expect(descreverPosto(dimensionar("24h"), 2)).toContain("4 com adicional noturno");
  });

  it("posto 12h diurno = 2 funcionários sem noturno; 12h noturno = 2 com noturno", () => {
    expect(COBERTURAS["12h_diurno"].funcionariosPorPosto).toBe(2);
    expect(COBERTURAS["12h_diurno"].turnos.every((t) => !t.noturno)).toBe(true);
    expect(COBERTURAS["12h_noturno"].funcionariosPorPosto).toBe(2);
    expect(COBERTURAS["12h_noturno"].turnos.every((t) => t.noturno)).toBe(true);
  });

  it("REGRESSÃO (teste do Pedro): posto 24h nunca é cotado como 2 pessoas sem noturno", () => {
    const p24 = calcularPreco({ serviceName: "Porteiro", employeesCount: 1, schedule: "12x36", cobertura: "24h" });
    const doisPorteiros = calcularPreco({ serviceName: "Porteiro", employeesCount: 2, schedule: "12x36" });
    expect(p24.funcionariosPorPosto).toBe(4);
    // O erro custava mais da metade do valor do posto.
    expect(p24.unitSalePrice).toBeGreaterThan(doisPorteiros.totalSalePrice * 2);
    expect(p24.turnos!.some((t) => t.costBreakdown.modulo1.adicionalNoturno > 0)).toBe(true);
  });

  it("o adicional noturno entra só no turno da noite, com a hora reduzida", () => {
    const r = calcularPreco({ serviceName: "Porteiro", employeesCount: 1, schedule: "12x36", cobertura: "24h" });
    const diurno = r.turnos!.find((t) => !t.noturno)!;
    const noturno = r.turnos!.find((t) => t.noturno)!;
    expect(diurno.costBreakdown.modulo1.adicionalNoturno).toBe(0);
    expect(diurno.costBreakdown.modulo1.horaNoturnaReduzida).toBe(0);
    // Linha D (cláusula 17ª: 20% entre 22h e 5h) e linha E (hora de 52min30s).
    expect(noturno.costBreakdown.modulo1.adicionalNoturno).toBeGreaterThan(0);
    expect(noturno.costBreakdown.modulo1.horaNoturnaReduzida).toBeGreaterThan(0);
    // O funcionário da noite custa mais que o do dia, e o posto é a soma dos quatro.
    expect(noturno.unitSalePrice).toBeGreaterThan(diurno.unitSalePrice);
    expect(r.unitSalePrice).toBeCloseTo(diurno.totalSalePrice + noturno.totalSalePrice, 2);
  });

  it("a margem incide sobre os quatro funcionários, adicional noturno incluído", () => {
    const r = calcularPreco({ serviceName: "Porteiro", employeesCount: 1, schedule: "12x36", cobertura: "24h" });
    const custoPosto = r.turnos!.reduce((s, t) => s + t.costBreakdown.custoPuro * t.funcionarios, 0);
    // BDI = ((1 + 2% indiretos) × (1 + 8% lucro)) / (1 − tributos) − 1, aplicado ao posto
    // inteiro. Somar o preço de venda por turno tem de dar o mesmo que aplicar o BDI sobre
    // a soma dos custos — é isso que garante que a margem não se perde no dimensionamento.
    expect(r.unitSalePrice).toBeCloseTo(custoPosto * (1 + BDI), 1);
    expect(r.unitCost).toBeCloseTo(custoPosto, 2);
    // E o lucro está mesmo lá dentro: o preço é maior que o custo pela margem inteira.
    expect(r.unitSalePrice).toBeGreaterThan(custoPosto * 1.2);
  });

  it("2 postos custam o dobro de 1 posto", () => {
    const um = calcularPreco({ serviceName: "Porteiro", employeesCount: 1, schedule: "12x36", cobertura: "24h" });
    const dois = calcularPreco({ serviceName: "Porteiro", employeesCount: 2, schedule: "12x36", cobertura: "24h" });
    expect(dois.totalSalePrice).toBeCloseTo(um.unitSalePrice * 2, 2);
  });

  it("cobertura fora da 12x36 não recebe número inventado", () => {
    const r = calcularPreco({
      serviceName: "Auxiliar de Serviços Gerais",
      employeesCount: 1,
      schedule: "5x2_44h",
      cobertura: "24h",
    });
    expect(r.coberturaNaoDimensionavel).toBe(true);
    expect(r.sobConsulta).toBe(true);
    expect(r.priceConfirmed).toBe(false);
  });

  it("cotação SEM cobertura continua idêntica — nenhuma proposta existente muda", () => {
    const asg = calcularPreco({ serviceName: "Auxiliar de Serviços Gerais", employeesCount: 1, schedule: "5x2_44h" });
    expect(asg.unitSalePrice).toBeGreaterThan(4964.5);
    expect(asg.unitSalePrice).toBeLessThan(4966.5);
    expect(asg.funcionariosPorPosto).toBe(1);
    expect(asg.funcionariosTotais).toBe(1);
    expect(asg.cobertura).toBeUndefined();
    expect(asg.turnos).toBeUndefined();
    expect(asg.coberturaNaoDimensionavel).toBe(false);
  });

  it("o rateio de material conta funcionários do contrato, não os do turno", () => {
    // 2 postos 24h = 8 funcionários, que é exatamente o corte do rateio. Se cada turno
    // fosse rateado sozinho (2 pessoas), o material cairia em sob consulta aqui.
    expect(POSTOS_MINIMOS_MATERIAL).toBe(8);
    const r = calcularPreco({
      serviceName: "Auxiliar de Serviços Gerais",
      employeesCount: 2,
      schedule: "12x36",
      cobertura: "24h",
      comMaterial: true,
    });
    expect(r.funcionariosTotais).toBe(8);
    expect(r.comMaterial).toBe(true);
    expect(r.materialSobConsulta).toBe(false);
    expect(r.rateioMaterialPorPosto).toBeGreaterThan(0);
  });

  it("a planilha sai com uma aba por turno, e só a noturna tem o adicional", () => {
    const abas = abasDoPosto({ serviceName: "Porteiro", employeesCount: 1, schedule: "12x36", cobertura: "24h" });
    expect(abas).toHaveLength(2);
    expect(abas[0].nome).toBe("Porteiro 24h diurno");
    expect(abas[1].nome).toBe("Porteiro 24h noturno");
    expect(abas[0].input.adicionais?.noturno).toBeFalsy();
    expect(abas[1].input.adicionais?.noturno).toBe(true);
    // Cada aba é do turno: 2 funcionários, não os 4 do posto nem 1 posto.
    expect(abas[0].input.employeesCount).toBe(2);
    expect(abas[1].input.employeesCount).toBe(2);
    // Sem cobertura, segue uma aba só, como sempre foi.
    expect(abasDoPosto({ serviceName: "Porteiro", employeesCount: 3 })).toHaveLength(1);
  });

  it("o adicional do cliente soma ao noturno, não é substituído por ele", () => {
    const r = calcularPreco({
      serviceName: "Porteiro",
      employeesCount: 1,
      schedule: "12x36",
      cobertura: "24h",
      adicionais: { insalubridade: "medio" },
    });
    // Posto 24h em hospital é insalubre de dia E de noite; a noite tem os dois.
    expect(r.turnos!.every((t) => t.costBreakdown.modulo1.insalubridade > 0)).toBe(true);
    const noturno = r.turnos!.find((t) => t.noturno)!;
    expect(noturno.costBreakdown.modulo1.adicionalNoturno).toBeGreaterThan(0);
  });
});

describe("detectarCobertura", () => {
  it("reconhece como o cliente fala de posto ininterrupto", () => {
    for (const frase of [
      "preciso de um posto 24h de porteiro",
      "quero cotação para portaria 24 horas",
      "posto ininterrupto",
      "porteiro full time, dia e noite",
      "precisamos de cobertura 24x7",
      "portaria 24hrs",
    ]) {
      expect(detectarCobertura(frase), frase).toBe("24h");
    }
  });

  it("lê faixa de horário", () => {
    expect(detectarCobertura("porteiro das 19h às 7h")).toBe("12h_noturno");
    expect(detectarCobertura("das 7h às 19h")).toBe("12h_diurno");
    expect(detectarCobertura("de 18 às 6")).toBe("12h_noturno");
  });

  it("reconhece turno noturno e diurno descritos em palavras", () => {
    expect(detectarCobertura("preciso de um posto noturno")).toBe("12h_noturno");
    expect(detectarCobertura("é só o turno da noite")).toBe("12h_noturno");
    expect(detectarCobertura("apenas turno diurno")).toBe("12h_diurno");
  });

  it("NÃO confunde prazo com cobertura", () => {
    // A própria Shayene promete reposição em 24h e proposta válida por 24 horas. Sem este
    // filtro, quem perguntasse o prazo receberia cotação de posto ininterrupto.
    for (const frase of [
      "vocês repõem o funcionário em até 24h?",
      "a proposta é válida por 24 horas?",
      "consigo resposta em 24h?",
      "qual o prazo de 24 horas para substituição",
    ]) {
      expect(detectarCobertura(frase), frase).toBeUndefined();
    }
  });

  it("não inventa cobertura em pedido comum", () => {
    expect(detectarCobertura("quero 2 porteiros na Barra")).toBeUndefined();
    expect(detectarCobertura("preciso de limpeza, 3 postos")).toBeUndefined();
    expect(detectarCobertura("")).toBeUndefined();
  });
});
