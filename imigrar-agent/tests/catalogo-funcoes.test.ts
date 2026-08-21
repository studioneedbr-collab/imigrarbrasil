import { describe, it, expect } from "vitest";
import { MemoryRepository } from "@/lib/data/memory-repository";
import { FUNCTION_CATALOG } from "@/lib/agent/function-catalog";
import { DEFAULT_PRICING, FUNCOES_COM_CCT } from "@/lib/agent/pricing-params";
import { executeTool } from "@/lib/agent/tools";

describe("catálogo de funções", () => {
  it("não tem nome duplicado", () => {
    const nomes = FUNCTION_CATALOG.map((f) => f.name.toLowerCase());
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  // Confirmado = tem piso na CCT da praça-base. Desde 13/08/2026 a convenção do Rio
  // cobre o catálogo inteiro: o que não está nominalmente na tabela cai na regra da
  // cláusula 7ª (piso de servente ou piso de encarregado).
  it("as funções confirmadas são exatamente as com piso na CCT", () => {
    const confirmadas = DEFAULT_PRICING.filter((p) => p.priceConfirmed).map((p) => p.functionName).sort();
    expect(confirmadas).toEqual([...FUNCOES_COM_CCT].sort());
  });

  it("nenhuma função confirmada entra com salário zerado", () => {
    for (const p of DEFAULT_PRICING.filter((x) => x.priceConfirmed)) {
      expect(p.baseSalary, p.functionName).toBeGreaterThan(0);
    }
  });

  it("portaria/vigia usa o uniforme social da planilha (58,50)", () => {
    const porteiro = DEFAULT_PRICING.find((p) => p.functionName === "Porteiro");
    expect(porteiro?.uniformeMes).toBe(58.5);
    expect(porteiro?.schedule).toBe("12x36");
    const vigia = DEFAULT_PRICING.find((p) => p.functionName === "Vigia");
    expect(vigia?.uniformeMes).toBe(58.5);
    // "PORTEIRO/VIGIA TERCEIRIZADO/ZELADOR R$ 2.051,95" — uma linha só na cláusula 3ª.
    expect(vigia?.baseSalary).toBe(2051.95);
  });

  it("as ~100 funções ficam disponíveis no repositório", async () => {
    const repo = new MemoryRepository();
    const todas = await repo.listFunctionPricing();
    expect(todas.length).toBe(FUNCTION_CATALOG.length);
    for (const nome of ["Vigia", "Recepcionista", "Soldador", "Salva-Vidas Civil", "Copeira"]) {
      expect(await repo.getFunctionPricing(nome), nome).not.toBeNull();
    }
  });
});

describe("calcular_preco_servico não vaza preço de função sob consulta", () => {
  it("ASG (confirmado) devolve o preço", async () => {
    const r = (await executeTool("calcular_preco_servico", {
      service_name: "Auxiliar de Serviços Gerais",
      employees_count: 1,
    })) as Record<string, unknown>;
    expect(r.priceConfirmed).toBe(true);
    expect(r.unitSalePrice).toBeCloseTo(4965.47, 2);
  });

  it("praça sem conferência não devolve valor nenhum", async () => {
    const r = (await executeTool("calcular_preco_servico", {
      service_name: "Vigia",
      employees_count: 2,
      region: "São Paulo",
    })) as Record<string, unknown>;
    expect(r.sobConsulta).toBe(true);
    expect(r.priceConfirmed).toBe(false);
    expect(r).not.toHaveProperty("unitSalePrice");
    expect(r).not.toHaveProperty("totalSalePrice");
  });

  it("função fora do catálogo também não devolve valor", async () => {
    const r = (await executeTool("calcular_preco_servico", {
      service_name: "Astronauta",
      employees_count: 1,
    })) as Record<string, unknown>;
    expect(r.sobConsulta).toBe(true);
    expect(r).not.toHaveProperty("unitSalePrice");
  });
});
