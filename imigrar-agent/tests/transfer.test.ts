import { describe, it, expect } from "vitest";
import { detectTransfer, buildDossie } from "@/lib/agent/transfer";

describe("transferência", () => {
  it("detecta assunto trabalhista", () => {
    const r = detectTransfer("tenho uma dúvida sobre férias de um funcionário");
    expect(r?.categoria).toBe("trabalhista");
  });
  it("não transfere assunto comercial normal", () => {
    expect(detectTransfer("quero um orçamento de limpeza")).toBeUndefined();
  });
  it("buildDossie resume o que foi coletado", () => {
    const d = buildDossie({
      cliente: { nome: "Maria", empresa: "Beta", cidade: "Niterói" },
      lead: { servicesInterested: ["Porteiro"], employeesNeeded: 2 },
      necessidade: "renovação de contrato",
    });
    expect(d.nome).toBe("Maria");
    expect(d.servicos).toContain("Porteiro");
    expect(d.necessidade).toContain("renovação");
  });
});
