import { describe, it, expect } from "vitest";
import { computeCostBreakdown } from "@/lib/comercial/pricing";
import { getPricingParams } from "@/lib/comercial/pricing-params";

describe("preço paramétrico", () => {
  it("ASG fecha em R$ 4.965,47/posto", () => {
    const p = getPricingParams("Auxiliar de Serviços Gerais")!;
    const b = computeCostBreakdown(p);
    expect(b.precoVenda).toBe(4965.47);
    expect(b.priceConfirmed).toBe(true);
  });

  it("função com salário maior gera preço proporcionalmente maior", () => {
    const asg = computeCostBreakdown(getPricingParams("Auxiliar de Serviços Gerais")!);
    const custom = computeCostBreakdown({
      functionName: "Porteiro", baseSalary: 2500, schedule: "12x36",
      uniformeMes: 58.5, equipamentosFunc: 0, materialFunc: 0, priceConfirmed: false,
    });
    expect(custom.precoVenda).toBeGreaterThan(asg.precoVenda);
    expect(custom.priceConfirmed).toBe(false);
  });
});
