import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { calcularPreco, computeCostBreakdown } from "@/lib/agent/pricing";
import {
  getPricingParams,
  resolverPraca,
  CCT_POR_PRACA,
  DEFAULT_PRICING,
  FUNCOES_COM_CCT,
  FUNCOES_PENDENTES_CCT,
} from "@/lib/agent/pricing-params";
import { SEED_SERVICES } from "@/lib/agent/catalog";
import { DEFAULT_KNOWLEDGE, buildSystemPrompt } from "@/lib/agent/knowledge";

const ASG = "Auxiliar de Serviços Gerais";

describe("detecção de praça", () => {
  it.each([
    ["São Paulo", "SP"],
    ["Campinas SP", "SP"],
    ["Rio de Janeiro", "RJ"],
    ["Barra da Tijuca", "RJ"],
    ["Belo Horizonte", "MG"],
    ["Brasília", "DF"],
    ["Vitória ES", "ES"],
    ["Curitiba", "PR"],
    ["Porto Alegre", "RS"],
    ["Florianópolis", "SC"],
    ["Dourados MS", "MS"],
    ["Salvador", "NE"],
    ["Recife PE", "NE"],
    ["Goiânia", "NCO"],
    ["Manaus", "NCO"],
  ])("%s → %s", (entrada, uf) => {
    expect(resolverPraca(entrada).uf).toBe(uf);
  });

  it("sem região, ou região desconhecida, usa o Rio (praça da composição fechada)", () => {
    expect(resolverPraca().uf).toBe("RJ");
    expect(resolverPraca("").uf).toBe("RJ");
    expect(resolverPraca("Marte").uf).toBe("RJ");
  });

  // "Barra da Tijuca" tem "BA" dentro; sem cidade antes de sigla, cairia no Nordeste.
  it("cidade do Rio não é confundida com sigla de estado", () => {
    expect(resolverPraca("Barra da Tijuca, Rio de Janeiro").uf).toBe("RJ");
    expect(resolverPraca("Niterói").uf).toBe("RJ");
  });

  // Campo Grande é bairro do Rio e capital do MS. Sozinho fica no Rio; com a sigla, vai
  // para o MS — que é praça travada, então o desfecho é sob consulta, nunca preço errado.
  it("Campo Grande sozinho fica no Rio; com a sigla vai para o MS", () => {
    expect(resolverPraca("Campo Grande").uf).toBe("RJ");
    expect(resolverPraca("Campo Grande/MS").uf).toBe("MS");
  });
});

describe("praça sem conferência humana não é cotada", () => {
  // As nove convenções chegaram em 13/08/2026, mas só o Rio foi lido cláusula por
  // cláusula e conferido. As outras têm os dados carregados e a trava ligada.
  it("só o Rio está liberado", () => {
    const cadastradas = CCT_POR_PRACA.filter((c) => c.cadastrada).map((c) => c.uf);
    expect(cadastradas).toEqual(["RJ"]);
  });

  it.each(["São Paulo", "Belo Horizonte", "Salvador", "Curitiba", "Goiânia", "Brasília"])(
    "%s sai sob consulta mesmo para o ASG, que tem piso no Rio",
    (regiao) => {
      const r = calcularPreco({ serviceName: ASG, employeesCount: 1, region: regiao });
      expect(r.cctCadastrada).toBe(false);
      expect(r.sobConsulta).toBe(true);
      expect(r.priceConfirmed).toBe(false);
    },
  );

  it("a praça é nomeada mesmo sem cotar, para a Shayene falar dela com o cliente", () => {
    expect(calcularPreco({ serviceName: ASG, employeesCount: 1, region: "Campinas" }).regiao).toBe(
      "São Paulo",
    );
    expect(calcularPreco({ serviceName: ASG, employeesCount: 1, region: "Salvador" }).regiao).toBe(
      "Nordeste",
    );
  });

  // Praça travada pode ter piso carregado — o que ela NÃO pode é cotar. A trava é o
  // `cadastrada`, não a ausência de dado.
  it("nenhuma praça travada devolve preço, mesmo tendo piso lido da convenção", () => {
    for (const c of CCT_POR_PRACA.filter((p) => !p.cadastrada)) {
      const r = calcularPreco({ serviceName: ASG, employeesCount: 1, region: c.regiao });
      expect(r.priceConfirmed, c.uf).toBe(false);
      expect(r.sobConsulta, c.uf).toBe(true);
    }
  });

  it("toda praça travada declara o que falta conferir", () => {
    for (const c of CCT_POR_PRACA.filter((p) => !p.cadastrada)) {
      expect(c.pendencias?.length, c.uf).toBeGreaterThan(0);
    }
  });
});

describe("o Rio continua sendo a âncora da planilha", () => {
  it("o ASG do Rio fecha exatamente em 4.965,47", () => {
    for (const regiao of [undefined, "Rio de Janeiro", "Barra da Tijuca", "Niterói"]) {
      const r = calcularPreco({ serviceName: ASG, employeesCount: 1, region: regiao });
      expect(r.unitSalePrice, String(regiao)).toBeCloseTo(4965.47, 2);
      expect(r.cctCadastrada, String(regiao)).toBe(true);
      expect(r.sobConsulta, String(regiao)).toBe(false);
    }
  });

  // Os três números que a planilha 2026 já usava, agora conferidos contra a convenção:
  // piso (cláusula 3ª), auxílio-alimentação (21ª) e Benefício Social Familiar (27ª).
  it("o Módulo 2.3 do Rio é calculado pela CCT e bate com a planilha", () => {
    const b = calcularPreco({ serviceName: ASG, employeesCount: 1 }).costBreakdown;
    expect(b.beneficiosDetalhe.valeTransporte).toBeCloseTo(108.89, 2); // 5,00 × 2 × 22 − 6% de 1.851,90
    expect(b.beneficiosDetalhe.alimentacao).toBeCloseTo(534.6, 2); // 27,00 × 22 − 10%
    expect(b.beneficiosDetalhe.beneficioSocial).toBeCloseTo(22.7, 2);
    expect(b.beneficios).toBeCloseTo(666.19, 2);
  });

  it("o piso do Rio vem da CCT da praça, não do parâmetro da função", () => {
    const rj = CCT_POR_PRACA.find((c) => c.uf === "RJ")!;
    expect(rj.pisos[ASG]).toBe(1851.9);
    expect(rj.registroMte).toBe("RJ000911/2026");
  });

  it("função fora do catálogo continua sob consulta, mesmo no Rio", () => {
    const r = calcularPreco({ serviceName: "Astronauta", employeesCount: 1 });
    expect(r.sobConsulta).toBe(true);
    expect(r.priceConfirmed).toBe(false);
  });
});

describe("pisos das funções que estavam pendentes até 13/08/2026", () => {
  // Cinco funções ficaram meses em "sob consulta" porque os pisos que estavam no código
  // (1998, 2050, 2100, 1950, 2000) eram redondos demais para ter saído de convenção — e
  // não tinham saído. Agora saem da CCT SIEMACO-RJ 2026/2027, cláusula 3ª.
  it.each([
    ["Porteiro", 2051.95],
    ["Zelador", 2051.95],
    ["Recepcionista", 1966.52],
    ["Jardineiro", 3035.56],
  ])("%s tem o piso da convenção: %s", (nome, piso) => {
    expect(getPricingParams(nome)?.baseSalary).toBe(piso);
    const r = calcularPreco({ serviceName: nome, employeesCount: 1, region: "Rio de Janeiro" });
    expect(r.priceConfirmed, nome).toBe(true);
    expect(r.pisoPorFallback, nome).toBe(false);
  });

  // Operador de Piscina não está na tabela da CCT. A própria convenção resolve, na
  // cláusula 7ª: função sem liderança e sem qualificação técnica recebe o piso de servente.
  it("Operador de Piscina cota pelo fallback que a própria CCT define", () => {
    const r = calcularPreco({ serviceName: "Operador de Piscina", employeesCount: 1 });
    expect(r.priceConfirmed).toBe(true);
    expect(r.pisoPorFallback).toBe(true);
    expect(r.costBreakdown.salarioBase).toBe(1851.9);
    expect(r.fontePiso).toMatch(/Cláusula 7ª/);
  });

  it("o piso de portaria nunca mais é o número redondo de 10/08/2026", () => {
    expect(getPricingParams("Porteiro")?.baseSalary).not.toBe(1998);
  });

  it("todo o catálogo tem piso, e nenhum é zero", () => {
    expect(FUNCOES_PENDENTES_CCT).toEqual([]);
    expect(FUNCOES_COM_CCT.length).toBeGreaterThan(90);
    for (const nome of FUNCOES_COM_CCT) {
      expect(getPricingParams(nome)!.baseSalary, nome).toBeGreaterThan(0);
    }
  });

  it("catálogo e motor não divergem sobre quem tem preço", () => {
    for (const s of SEED_SERVICES) {
      const p = getPricingParams(s.name);
      expect(p?.priceConfirmed, s.name).toBe(s.priceConfirmed);
      expect(p?.baseSalary, s.name).toBe(s.baseSalary);
    }
  });

  it("o Porteiro mantém uniforme social e escala 12x36", () => {
    const p = getPricingParams("Porteiro")!;
    expect(p.uniformeMes).toBe(58.5);
    expect(p.schedule).toBe("12x36");
    expect(computeCostBreakdown(p).precoVenda).toBeGreaterThan(0);
  });
});

// O relatório é o que o Pedro e o Eduardo leem para liberar praça. Se ele descrever uma
// realidade diferente da do código, alguém libera errado — então ele é testado.
describe("relatório de conferência não pode divergir do código", () => {
  const doc = readFileSync(
    join(process.cwd(), "docs", "conferencia-cct-2026.md"),
    "utf-8",
  );

  it("toda praça do código aparece no relatório", () => {
    for (const c of CCT_POR_PRACA) {
      expect(doc, c.regiao).toContain(c.regiao);
    }
  });

  it("o relatório marca como liberada exatamente a praça que cota", () => {
    for (const c of CCT_POR_PRACA) {
      if (!c.sindicato) continue; // Nordeste e Norte/Centro-Oeste são só rótulo
      const cabecalho = doc.split("\n").find((l) => l.startsWith("## ") && l.includes(c.regiao));
      expect(cabecalho, c.regiao).toBeTruthy();
      expect(cabecalho!.includes("✅"), `${c.regiao} liberada no relatório`).toBe(c.cadastrada);
    }
  });
});

// A migration 015 é a cópia dos pisos do código para a tabela do admin. Se as duas
// divergirem, a tela Comercial → Preços por função mostra um número e a Shayene fala
// outro — que é exatamente o desencontro que gerou o preço inventado de 10/08/2026.
describe("migration 015 não pode divergir dos pisos do código", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "015_cct_rj_2026_catalogo.sql"),
    "utf-8",
  );
  const naSql = new Map<string, { piso: number; escala: string; uniforme: number }>();
  const linhaSql = /^ {2}\('(.+?)', ([\d.]+), '([^']+)', ([\d.]+),/gm;
  for (let m = linhaSql.exec(sql); m !== null; m = linhaSql.exec(sql)) {
    naSql.set(m[1].replace(/''/g, "'"), { piso: Number(m[2]), escala: m[3], uniforme: Number(m[4]) });
  }

  it("tem exatamente as funções do catálogo", () => {
    expect(naSql.size).toBe(DEFAULT_PRICING.length);
  });

  it("piso, escala e uniforme batem função a função", () => {
    for (const p of DEFAULT_PRICING) {
      const linha = naSql.get(p.functionName);
      expect(linha, p.functionName).toBeTruthy();
      expect(linha!.piso, p.functionName).toBe(p.baseSalary);
      expect(linha!.escala, p.functionName).toBe(p.schedule);
      expect(linha!.uniforme, p.functionName).toBe(p.uniformeMes);
    }
  });

  it("a 013 está marcada como obsoleta, para ninguém rodar os placeholders", () => {
    const antiga = readFileSync(
      join(process.cwd(), "supabase", "migrations", "013_cct_funcoes_principais.sql"),
      "utf-8",
    );
    expect(antiga).toMatch(/OBSOLETA — NÃO RODE/);
  });
});

describe("guardrail de preço não validado", () => {
  it("o prompt proíbe qualquer número para função sem piso", () => {
    const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE);
    expect(prompt).toContain("GUARDRAILS — NUNCA FAZER");
    expect(prompt).toMatch(/NUNCA INVENTE OU ESTIME UM PREÇO/);
    expect(prompt).toMatch(/sobConsulta: true/);
    expect(prompt).toMatch(/priceConfirmed: false/);
    // Não basta proibir "R$": o modelo contorna com "em torno de" e faixa.
    expect(prompt).toMatch(/em torno de.*a partir de.*gira em|Zero número/);
  });

  it("o prompt proíbe converter o preço do Rio em outra praça por percentual", () => {
    const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE);
    expect(prompt).toMatch(/NUNCA aplique um percentual sobre o pre[çc]o do Rio/i);
  });
});
