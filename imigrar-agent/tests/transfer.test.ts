import { describe, it, expect } from "vitest";
import { detectTransfer, buildDossie } from "@/lib/agent/transfer";

describe("transferência", () => {
  it("detecta caso concreto que precisa de advogado", () => {
    const r = detectTransfer("meu visto venceu e estou irregular");
    expect(r?.categoria).toBe("situacao_irregular");
  });
  it("não transfere dúvida geral sobre um caminho migratório", () => {
    expect(detectTransfer("como funciona a residência pelo Mercosul?")).toBeUndefined();
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
