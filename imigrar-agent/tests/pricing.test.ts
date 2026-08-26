import { describe, it, expect } from "vitest";
import { BDI, CUSTOS_INDIRETOS, LUCRO, calcularPreco, computeCostBreakdown } from "@/lib/comercial/pricing";
import { getPricingParams } from "@/lib/comercial/pricing-params";

describe("pricing engine", () => {
  it("ancora ASG 5x2 44h em ~R$ 4.965,47 por posto", () => {
    const r = calcularPreco({ serviceName: "Auxiliar de Serviços Gerais", employeesCount: 1, schedule: "5x2_44h" });
    expect(r.unitSalePrice).toBeGreaterThan(4964.5);
    expect(r.unitSalePrice).toBeLessThan(4966.5);
  });

  // Subtotal A+B+C+D+E do quadro resumo da planilha (aba SERVENTE).
  it("custo puro do ASG = R$ 3.930,10, sem material e sem equipamento", () => {
    const b = computeCostBreakdown(getPricingParams("Auxiliar de Serviços Gerais")!);
    expect(b.custoPuro).toBeCloseTo(3930.1, 2);
    expect(b.equipamentos).toBe(0);
    expect(b.material).toBe(0);
    expect(b.uniforme).toBe(46.97);
  });

  // Módulo 6: taxa administrativa da Shine Rio (2% de custo + 8% de lucro, decisão do
  // Eduardo em 17/08/2026) + tributos 12,81% "por dentro" = 26,34% sobre o custo. Com a
  // margem antiga de 6% esta mesma conta dava os 24,00% da planilha modelo.
  // A conta é composta, não calibrada: com equipamento e material no custo o BDI calibrado
  // caía para ~10%, e toda função que não fosse o ASG sairia subprecificada.
  it("BDI é a taxa administrativa composta (26,34%), não um resíduo de calibragem", () => {
    const b = computeCostBreakdown(getPricingParams("Auxiliar de Serviços Gerais")!);
    expect(b.bdi / b.custoPuro).toBeCloseTo(0.2634, 3);
    expect(b.bdi).toBeCloseTo(1035.38, 1);
  });

  // O lucro é o único percentual que a Shine escolhe. Se alguém mexer nele sem querer,
  // todo preço do sistema muda — este teste é o alarme.
  it("a margem vigente é 2% de custo + 8% de lucro", () => {
    expect(CUSTOS_INDIRETOS).toBe(0.02);
    expect(LUCRO).toBe(0.08);
    expect(BDI).toBeCloseTo(((1 + 0.02) * (1 + 0.08)) / (1 - 0.1281) - 1, 10);
  });

  it("multiplica pelo número de funcionários", () => {
    const r = calcularPreco({ serviceName: "Auxiliar de Serviços Gerais", employeesCount: 3, schedule: "5x2_44h" });
    expect(r.totalSalePrice).toBeCloseTo(r.unitSalePrice * 3, 1);
  });

  it("12x36 é preço por pessoa (não multiplica postos)", () => {
    const r = calcularPreco({ serviceName: "Porteiro", employeesCount: 1, schedule: "12x36" });
    expect(r.postsPerEmployee).toBe(1);
    expect(r.totalSalePrice).toBeCloseTo(r.unitSalePrice, 2);
  });

  // Vale-transporte e auxílio-refeição são "por dia efetivamente trabalhado" nas palavras
  // da CCT. Quem faz 12x36 trabalha ~15,21 dias por mês, não 22 — cobrar 22 dias de vale
  // num posto de portaria põe no preço sete dias de benefício que ninguém paga.
  it("o 12x36 paga vale por 15,21 dias, não pelos 22 do 5x2", () => {
    const doze = calcularPreco({ serviceName: "Porteiro", employeesCount: 1, schedule: "12x36" });
    const cinco = calcularPreco({ serviceName: "Porteiro", employeesCount: 1, schedule: "5x2_44h" });
    expect(doze.costBreakdown.beneficiosDetalhe.alimentacao).toBeCloseTo(27 * 15.21 * 0.9, 2);
    expect(cinco.costBreakdown.beneficiosDetalhe.alimentacao).toBeCloseTo(27 * 22 * 0.9, 2);
    expect(doze.unitSalePrice).toBeLessThan(cinco.unitSalePrice);
  });

  it("função fora do catálogo é 'sob consulta'", () => {
    expect(calcularPreco({ serviceName: "Auxiliar de Serviços Gerais", employeesCount: 1 }).sobConsulta).toBe(false);
    expect(calcularPreco({ serviceName: "Função Inexistente", employeesCount: 1 }).sobConsulta).toBe(true);
  });
});

// Módulo 1 da planilha (linhas B a F) e Módulo 4.2 — as "células pendentes" que o Eduardo
// pediu em 13/08/2026 para serem preenchidas com o que a IA coleta na conversa.
describe("adicionais da CCT no Módulo 1", () => {
  const ASG = "Auxiliar de Serviços Gerais";

  it("insalubridade incide sobre o piso de servente, como manda a cláusula 18ª", () => {
    const r = calcularPreco({ serviceName: ASG, employeesCount: 1, adicionais: { insalubridade: "maximo" } });
    expect(r.costBreakdown.modulo1.insalubridade).toBeCloseTo(1851.9 * 0.4, 2);
    const medio = calcularPreco({ serviceName: ASG, employeesCount: 1, adicionais: { insalubridade: "medio" } });
    expect(medio.costBreakdown.modulo1.insalubridade).toBeCloseTo(1851.9 * 0.2, 2);
    expect(r.unitSalePrice).toBeGreaterThan(medio.unitSalePrice);
  });

  it("periculosidade é 30% do salário base", () => {
    const r = calcularPreco({ serviceName: "Alpinista Predial", employeesCount: 1, adicionais: { periculosidade: true } });
    expect(r.costBreakdown.modulo1.periculosidade).toBeCloseTo(2965.75 * 0.3, 2);
  });

  // Cláusula 18ª, parágrafo sétimo: não há acúmulo, o empregado opta. O custo é o maior.
  it("insalubridade e periculosidade não se acumulam — fica a maior", () => {
    const r = calcularPreco({
      serviceName: ASG,
      employeesCount: 1,
      adicionais: { insalubridade: "medio", periculosidade: true },
    });
    const m1 = r.costBreakdown.modulo1;
    expect(Math.min(m1.insalubridade, m1.periculosidade)).toBe(0);
    // 30% de periculosidade > 20% de insalubridade grau médio, sobre a mesma base.
    expect(m1.periculosidade).toBeCloseTo(1851.9 * 0.3, 2);
  });

  it("noturno soma adicional de 20% e a hora reduzida de 52min30s", () => {
    const r = calcularPreco({ serviceName: "Porteiro", employeesCount: 1, adicionais: { noturno: true } });
    const horas = 7 * 15.21;
    const valorHora = 2051.95 / 220;
    expect(r.costBreakdown.modulo1.adicionalNoturno).toBeCloseTo(valorHora * horas * 0.2, 1);
    expect(r.costBreakdown.modulo1.horaNoturnaReduzida).toBeCloseTo(valorHora * horas * (60 / 52.5 - 1), 1);
  });

  it("gratificação de liderança segue as faixas das cláusulas 13ª e 14ª", () => {
    const faixas: Array<[number, number]> = [
      [10, 0.15],
      [25, 0.25],
      [45, 0.3],
      [80, 0.4],
    ];
    for (const [equipe, pct] of faixas) {
      const r = calcularPreco({ serviceName: "Encarregado", employeesCount: 1, adicionais: { lideraEquipeDe: equipe } });
      expect(r.costBreakdown.modulo1.gratificacaoFuncao, `equipe ${equipe}`).toBeCloseTo(1851.9 * pct, 2);
    }
  });

  it("intrajornada indenizada entra no Módulo 4.2, não no Módulo 1", () => {
    const r = calcularPreco({
      serviceName: "Porteiro",
      employeesCount: 1,
      adicionais: { intrajornadaIndenizada: true },
    });
    // 30 min a 50% = 0,75h por dia trabalhado, sobre a hora da remuneração.
    expect(r.costBreakdown.intrajornada).toBeCloseTo((2051.95 / 220) * 0.75 * 15.21, 1);
    expect(r.costBreakdown.modulo1.total).toBe(2051.95);
  });

  it("posto sem adicional nenhum não muda o preço da planilha", () => {
    const semAdicional = calcularPreco({ serviceName: ASG, employeesCount: 1 });
    const vazio = calcularPreco({ serviceName: ASG, employeesCount: 1, adicionais: {} });
    expect(vazio.unitSalePrice).toBe(semAdicional.unitSalePrice);
    expect(vazio.unitSalePrice).toBeCloseTo(4965.47, 2);
  });

  // A trava nova: adicional que a convenção da praça não sabe calcular derruba o preço
  // para sob consulta, em vez de sair um número que ignora o adicional em silêncio.
  it("adicional que a CCT não cobre derruba para sob consulta", () => {
    const r = calcularPreco({
      serviceName: ASG,
      employeesCount: 1,
      adicionais: { lideraEquipeDe: 10, intrajornadaIndenizada: true },
      region: "Rio de Janeiro",
    });
    expect(r.priceConfirmed).toBe(true); // o Rio cobre os dois

    const semCobertura = calcularPreco({
      serviceName: ASG,
      employeesCount: 1,
      adicionais: { insalubridade: "medio" },
      region: "Belo Horizonte",
    });
    expect(semCobertura.sobConsulta).toBe(true);
  });
});
