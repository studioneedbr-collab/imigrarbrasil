import { describe, it, expect } from "vitest";
import { DEFAULT_KNOWLEDGE, buildSystemPrompt } from "@/lib/agent/knowledge";
import { computeCostBreakdown } from "@/lib/agent/pricing";
import { getPricingParams } from "@/lib/agent/pricing-params";

const secao = (id: string) => DEFAULT_KNOWLEDGE.sections.find((s) => s.id === id)!;

describe("conhecimento técnico de composição de custos", () => {
  it("a seção existe e entra no system prompt", () => {
    expect(secao("conhecimento_tecnico")).toBeDefined();
    const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE);
    expect(prompt).toContain("CONHECIMENTO TÉCNICO");
    expect(prompt).toContain("COMO VOCÊ VENDE");
  });

  it("descreve os 6 módulos", () => {
    const b = secao("conhecimento_tecnico").body;
    for (const m of ["MÓDULO 1", "MÓDULO 2", "MÓDULO 3", "MÓDULO 4", "MÓDULO 5", "MÓDULO 6"]) {
      expect(b, m).toContain(m);
    }
  });

  // Os números que a Shayene decora precisam ser os mesmos que o motor calcula. Se o
  // motor mudar e o texto não, ela passa a explicar uma conta que o sistema não faz.
  it("os valores do texto batem com o que o motor calcula", () => {
    const b = computeCostBreakdown(getPricingParams("Auxiliar de Serviços Gerais")!);
    const texto = secao("conhecimento_tecnico").body;
    const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    expect(texto).toContain(fmt(b.salarioBase)); // 1.851,90
    expect(texto).toContain(fmt(b.custoPuro)); // 3.930,10
    expect(texto).toContain(fmt(b.bdi)); // 943,42
    expect(texto).toContain(fmt(b.precoVenda)); // 4.873,52
    expect(texto).toContain(fmt(b.uniforme)); // 46,97 — Módulo 5
  });

  // O Módulo 5 do preço PADRÃO é só uniforme. Material e equipamento entram por cima,
  // e só quando o cliente pede — e sempre pela tool, nunca por conta da Shayene.
  it("o Módulo 5 padrão é só uniforme, e o material vem da tool", () => {
    const b = secao("conhecimento_tecnico").body;
    expect(b).toContain("MÓDULO 5 — INSUMOS: R$ 46,97");
    expect(b).not.toContain("540,35"); // soma errada que incluía material e equipamento
    expect(b).toMatch(/SÓ O UNIFORME/i);
    expect(b).toMatch(/com_material/);
    expect(b).toMatch(/NUNCA faz essa conta de cabeça/i);
  });

  // Os rateios da planilha (102,20 e 391,18) pressupõem contrato de 12 postos. Se
  // vazarem para o texto, a Shayene decora e passa a citá-los como se fossem fixos.
  it("os números de rateio não aparecem no texto que a Shayene decora", () => {
    const b = secao("conhecimento_tecnico").body;
    expect(b).not.toContain("102,20");
    expect(b).not.toContain("391,18");
  });

  it("registra o BDI efetivo de 26,34%, não a soma de percentuais sobre bases diferentes", () => {
    const b = secao("conhecimento_tecnico").body;
    expect(b).toContain("26,34%");
    expect(b).not.toContain("22,81%"); // 2% + 8% + 12,81% somados a seco, sobre bases diferentes
  });

  // A taxa administrativa é decisão do Eduardo (17/08/2026). Se o texto continuar dizendo
  // 6% de lucro depois de o motor passar a cobrar 8%, ela explica ao cliente uma margem
  // que a Shine não pratica.
  it("a margem que ela explica é a que o motor cobra", () => {
    const b = secao("conhecimento_tecnico").body;
    expect(b).toContain("Lucro 8%");
    expect(b).not.toContain("Lucro 6%");
  });

  it("não deixa ela calcular preço de outra praça de cabeça", () => {
    const b = secao("conhecimento_tecnico").body;
    expect(b).toMatch(/N[ÃA]O calcula preço de outra praça/i);
  });

  it("desconto: fala da condição, nunca do percentual", () => {
    const b = secao("conhecimento_tecnico").body;
    expect(b).toMatch(/nunca anuncia um número com desconto/i);
    // Percentuais concretos de desconto sairiam da boca dela como oferta fechada.
    expect(b).not.toMatch(/desconto de \d+ a \d+%/i);
  });

  it("as escalas e as diferenças entre funções estão descritas", () => {
    const b = secao("conhecimento_tecnico").body;
    for (const t of ["5x2 44h", "12x36", "6x1 44h", "CBO 5143-20", "NR-10", "NR-35", "salva-vidas"]) {
      expect(b, t).toContain(t);
    }
  });
});

describe("os scripts de venda são modelo, não frase pronta", () => {
  it("o bloco manda falar com as próprias palavras", () => {
    const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE);
    const bloco = prompt.slice(prompt.indexOf("COMO VOCÊ VENDE"), prompt.indexOf("EXEMPLOS DE RACIOCÍNIO"));
    expect(bloco).toMatch(/não frases para copiar|com as suas palavras/i);
    expect(bloco).toMatch(/70%/); // comparativo com contratação direta
    expect(bloco).toMatch(/quem fecha o número é o comercial/i);
  });
});
