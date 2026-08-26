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
  // significam nada num caso de imigração — o dossiê não os preenche mais.
  it("não carrega mais quantidade de postos nem escala", () => {
    const d = buildDossie({ lead: { contactName: "Jean" }, necessidade: "reunião familiar" });
    expect(d.quantidade).toBeUndefined();
    expect(d.escala).toBeUndefined();
  });
});
