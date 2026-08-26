import { describe, it, expect } from "vitest";
import { MemoryRepository } from "@/lib/data/memory-repository";
import { FUNCTION_CATALOG } from "@/lib/comercial/function-catalog";
import { DEFAULT_PRICING, FUNCOES_COM_CCT } from "@/lib/comercial/pricing-params";
import { calcularPreco } from "@/lib/comercial/pricing";

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

// O motor não inventa preço para o que não tem piso conferido. Antes isto era testado
// pela tool do agente; a tool não existe mais, e a garantia passou a ser cobrada direto
// no motor, que é quem as telas do painel chamam.
describe("o motor não devolve preço de função sob consulta", () => {
  it("ASG (confirmado) devolve o preço", () => {
    const r = calcularPreco({ serviceName: "Auxiliar de Serviços Gerais", employeesCount: 1 });
    expect(r.priceConfirmed).toBe(true);
    expect(r.unitSalePrice).toBeCloseTo(4965.47, 2);
  });

  it("praça sem conferência não confirma preço", () => {
    const r = calcularPreco({ serviceName: "Vigia", employeesCount: 2, region: "São Paulo" });
    expect(r.sobConsulta).toBe(true);
    expect(r.priceConfirmed).toBe(false);
    expect(r.cctCadastrada).toBe(false);
  });

  it("função fora do catálogo também não confirma preço", () => {
    const r = calcularPreco({ serviceName: "Astronauta", employeesCount: 1 });
    expect(r.sobConsulta).toBe(true);
    expect(r.priceConfirmed).toBe(false);
  });
});
