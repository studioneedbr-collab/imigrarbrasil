import { describe, it, expect } from "vitest";
import { TIPOS_DE_CHAMADA } from "@/lib/domain/types";
import { rotuloDoUso } from "@/lib/integracoes/provedores";

// O CUSTO DA TRADUÇÃO PRECISA APARECER SEPARADO.
//
// `registrarChamada` engole exceção de propósito. Se 'traducao' não for um tipo válido, a
// tradução funciona e o custo dela some sem erro nenhum — que é o pior jeito de um número
// ficar errado: ninguém descobre.
describe("tradução no vocabulário de custo", () => {
  it("é um tipo de chamada como os outros", () => {
    expect(TIPOS_DE_CHAMADA).toContain("traducao");
  });

  it("tem rótulo legível na tela de provedores", () => {
    expect(rotuloDoUso("traducao")).toBe("tradução");
  });
});
