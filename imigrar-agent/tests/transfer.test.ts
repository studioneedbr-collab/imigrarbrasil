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
  it("buildDossie resume o que o advogado lê primeiro", () => {
    const d = buildDossie({
      lead: {
        contactName: "Yolanda",
        region: "Brasil — Boa Vista",
        servicesInterested: ["Regularização migratória"],
      },
      necessidade: "protocolo em análise há oito meses",
    });
    expect(d.nome).toBe("Yolanda");
    expect(d.cidade).toBe("Brasil — Boa Vista");
    expect(d.servicos).toContain("Regularização migratória");
    expect(d.necessidade).toContain("protocolo");
  });

  // Quantidade de postos e escala de trabalho vinham da base de terceirização e não
  // significam nada num caso de imigração — saíram do dossiê e do tipo.
  it("carrega só o que serve a um caso de imigração", () => {
    const d = buildDossie({ lead: { contactName: "Jean" }, necessidade: "reunião familiar" });
    expect(Object.keys(d)).not.toContain("quantidade");
    expect(Object.keys(d)).not.toContain("escala");
    expect(d.necessidade).toBe("reunião familiar");
  });
});
