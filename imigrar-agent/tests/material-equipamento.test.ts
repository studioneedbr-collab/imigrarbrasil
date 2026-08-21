import { describe, it, expect } from "vitest";
import { detectTransfer } from "@/lib/agent/transfer";
import { computeCostBreakdown, calcularPreco, POSTOS_MINIMOS_MATERIAL } from "@/lib/agent/pricing";
import { getPricingParams, DEFAULT_PRICING } from "@/lib/agent/pricing-params";
import { DEFAULT_KNOWLEDGE } from "@/lib/agent/knowledge";

const ASG = "Auxiliar de Serviços Gerais";

// Teste do Guido em 10/08/2026: a Shayene disse que o valor incluía material e, quando o
// cliente pediu para tirar, inventou um desconto ("fica em torno de R$ 4.700"). A conta
// do material passou a existir em 11/08/2026, mas quem faz é a tool — nunca ela.

describe("o preço padrão continua sendo só mão de obra", () => {
  it("nenhuma função carrega material ou equipamento no cadastro", () => {
    for (const p of DEFAULT_PRICING) {
      expect(p.equipamentosFunc, p.functionName).toBe(0);
      expect(p.materialFunc, p.functionName).toBe(0);
    }
  });

  it("sem pedir material, o ASG fecha em R$ 4.965,47", () => {
    const r = calcularPreco({ serviceName: ASG, employeesCount: 1 });
    expect(r.unitSalePrice).toBeCloseTo(4965.47, 1);
    expect(r.comMaterial).toBe(false);
    expect(r.materialSobConsulta).toBe(false);
    expect(r.rateioMaterialPorPosto).toBe(0);
  });

  it("a composição bate módulo a módulo com a planilha", () => {
    const b = computeCostBreakdown(getPricingParams(ASG)!);
    expect(b.salarioBase).toBeCloseTo(1851.9, 2); // Módulo 1
    expect(b.uniforme).toBeCloseTo(46.97, 2); // Módulo 5 = só uniforme
    expect(b.equipamentos + b.material).toBe(0);
    expect(b.custoPuro).toBeCloseTo(3930.1, 2); // subtotal A+B+C+D+E
    expect(b.bdi).toBeCloseTo(1035.38, 1); // Módulo 6
  });
});

// Abas EQUIPAMENTOS (R$ 1.226,39/mês) e MATERIAL (R$ 4.694,15/mês) da planilha: custo do
// CONTRATO, rateado pelos postos. A lista é de um prédio inteiro, não de uma pessoa.
describe("com material, o rateio entra e diminui conforme o contrato cresce", () => {
  it("cotar com material sai mais caro que só mão de obra", () => {
    const semMat = calcularPreco({ serviceName: ASG, employeesCount: 12 });
    const comMat = calcularPreco({ serviceName: ASG, employeesCount: 12, comMaterial: true });
    expect(comMat.comMaterial).toBe(true);
    expect(comMat.unitSalePrice).toBeGreaterThan(semMat.unitSalePrice);
  });

  it("12 postos reproduzem o rateio da própria planilha (R$ 493,38/posto)", () => {
    const r = calcularPreco({ serviceName: ASG, employeesCount: 12, comMaterial: true });
    // 1.226,39/12 = 102,20 (aba EQUIPAMENTOS) + 4.694,15/12 = 391,18 (aba MATERIAL)
    expect(r.costBreakdown.equipamentos).toBeCloseTo(102.2, 2);
    expect(r.costBreakdown.material).toBeCloseTo(391.18, 2);
    expect(r.rateioMaterialPorPosto).toBeCloseTo(493.38, 2);
    expect(r.unitSalePrice).toBeCloseTo(5588.83, 1);
  });

  it("contrato maior dilui o material: o preço por posto cai", () => {
    const p = (n: number) =>
      calcularPreco({ serviceName: ASG, employeesCount: n, comMaterial: true }).unitSalePrice;
    expect(p(8)).toBeGreaterThan(p(12));
    expect(p(12)).toBeGreaterThan(p(20));
    expect(p(20)).toBeGreaterThan(p(30));
  });

  it("o total do contrato de material é o mesmo, independente do nº de postos", () => {
    const total = (n: number) => {
      const r = calcularPreco({ serviceName: ASG, employeesCount: n, comMaterial: true });
      return r.rateioMaterialPorPosto * n;
    };
    expect(total(8)).toBeCloseTo(5920.54, 0);
    expect(total(12)).toBeCloseTo(5920.54, 0);
    expect(total(30)).toBeCloseTo(5920.54, 0);
  });

  it("o rateio não mexe no piso nem nos benefícios da CCT", () => {
    const semMat = calcularPreco({ serviceName: ASG, employeesCount: 12 });
    const comMat = calcularPreco({ serviceName: ASG, employeesCount: 12, comMaterial: true });
    expect(comMat.costBreakdown.salarioBase).toBe(semMat.costBreakdown.salarioBase);
    expect(comMat.costBreakdown.beneficios).toBe(semMat.costBreakdown.beneficios);
  });

  it("material e uniforme são independentes: dá para ter os dois ao mesmo tempo", () => {
    const r = calcularPreco({
      serviceName: ASG, employeesCount: 12, comMaterial: true, semUniforme: true,
    });
    expect(r.costBreakdown.uniforme).toBe(0);
    expect(r.rateioMaterialPorPosto).toBeCloseTo(493.38, 2);
  });
});

// A lista da planilha é de um prédio grande. Concentrada em 1 posto daria R$ 5.920,54/mês
// só de material, e o posto sairia por R$ 12.215 — nenhum cliente de um posto precisa de
// 150 lixeiras de banheiro.
describe("contrato pequeno não recebe rateio de material", () => {
  it.each([1, 2, 4, POSTOS_MINIMOS_MATERIAL - 1])(
    "%d posto(s): o preço volta sem material e sinalizado",
    (n) => {
      const r = calcularPreco({ serviceName: ASG, employeesCount: n, comMaterial: true });
      expect(r.materialSobConsulta).toBe(true);
      expect(r.comMaterial).toBe(false);
      expect(r.rateioMaterialPorPosto).toBe(0);
      // A mão de obra continua cotável: só o material vai para o humano.
      expect(r.sobConsulta).toBe(false);
      expect(r.unitSalePrice).toBeCloseTo(4965.47, 1);
    },
  );

  it("no corte exato o material já entra", () => {
    const r = calcularPreco({
      serviceName: ASG, employeesCount: POSTOS_MINIMOS_MATERIAL, comMaterial: true,
    });
    expect(r.comMaterial).toBe(true);
    expect(r.materialSobConsulta).toBe(false);
  });
});

describe("o que a Shayene resolve sozinha e o que ela encaminha", () => {
  // Antes, qualquer menção a "material" era transferida — o que a impedia de fazer a
  // pergunta comercial básica de quem fornece o material.
  const resolveSozinha = [
    "o material de limpeza está incluso?",
    "esse valor inclui material?",
    "retire da proposta o custo de material",
    "eu já tenho os produtos de limpeza",
    "vocês fornecem material?",
  ];
  for (const msg of resolveSozinha) {
    it(`não encaminha: "${msg}"`, () => {
      expect(detectTransfer(msg)).toBeUndefined();
    });
  }

  // Máquina citada pelo nome é dimensionamento de escopo, e disso o rateio não trata.
  const encaminha = ["precisa de enceradeira e aspirador?", "vocês trazem lavadora de alta pressão?"];
  for (const msg of encaminha) {
    it(`encaminha: "${msg}"`, () => {
      expect(detectTransfer(msg)?.categoria).toBe("material_equipamento");
    });
  }

  it("não encaminha EPI — isso a Shine fornece e ela responde sozinha", () => {
    expect(detectTransfer("vocês fornecem equipamento de proteção individual?")).toBeUndefined();
  });

  it("não encaminha uma pergunta comum de preço", () => {
    expect(detectTransfer("quanto custa um auxiliar de serviços gerais?")).toBeUndefined();
  });
});

describe("a base de conhecimento manda perguntar antes de cotar", () => {
  const precos = DEFAULT_KNOWLEDGE.sections.find((s) => s.id === "precos")!.body;

  it("a pergunta de quem fornece o material é obrigatória", () => {
    expect(precos).toMatch(/PERGUNTA OBRIGAT[ÓO]RIA/i);
    expect(precos).toMatch(/com_material/);
  });

  it("valor de material só pode vir da tool", () => {
    expect(precos).toMatch(/S[ÓO] VEM DA TOOL/i);
    expect(precos).toMatch(/Nunca some, estime ou cite de cabeça/i);
  });

  it("contrato pequeno tem instrução explícita de encaminhar", () => {
    expect(precos).toMatch(/materialSobConsulta/);
    expect(precos).toMatch(/transferir_para_humano/);
  });
});
