import { describe, it, expect } from "vitest";
import { MemoryRepository } from "@/lib/data/memory-repository";

describe("function pricing repo", () => {
  it("vem com ASG por padrão", async () => {
    const repo = new MemoryRepository();
    const asg = await repo.getFunctionPricing("Auxiliar de Serviços Gerais");
    expect(asg?.priceConfirmed).toBe(true);
  });
  it("upsert cadastra nova função e recupera", async () => {
    const repo = new MemoryRepository();
    await repo.upsertFunctionPricing({ functionName: "Porteiro", baseSalary: 1998, schedule: "12x36", uniformeMes: 58.5, equipamentosFunc: 0, materialFunc: 0, priceConfirmed: true });
    const p = await repo.getFunctionPricing("porteiro");
    expect(p?.baseSalary).toBe(1998);
    expect(p?.priceConfirmed).toBe(true);
  });
});
