import { describe, it, expect } from "vitest";
import { generateProposalPdf } from "@/lib/pdf/generate";

describe("generateProposalPdf", () => {
  it("gera um Buffer de PDF válido", async () => {
    const { buffer, filename } = await generateProposalPdf({
      leadData: { company_name: "Condomínio Teste", cnpj: "00.000.000/0001-00" },
      services: [{ name: "Auxiliar de Serviços Gerais", quantity: 2, unitPrice: 4873.52, schedule: "5x2_44h" }],
      totalValue: 9747.04,
    });
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(filename.toLowerCase()).toContain("proposta-shine-rio");
  });
});
