import { describe, it, expect } from "vitest";
import {
  RELOGIO_APERTADO_DIAS,
  diasDoRelogio,
  montarFila,
  relogioApertado,
  rotuloRelogio,
  type LeadDaFila,
} from "@/lib/fila/ordenacao";
import { semCamposSoDeHumano } from "@/lib/data/prazo";
import { MemoryRepository } from "@/lib/data/memory-repository";

// PRAZO MOLE VIRA DURO. "Aulas começam em março" é tranquilo em novembro e é emergência
// em fevereiro. A data opcional existe para essa virada aparecer — e para NÃO virar prazo
// processual, que é a outra metade do contrato.

const AGORA = new Date("2026-02-01T12:00:00Z");

function lead(p: Partial<LeadDaFila> = {}): LeadDaFila {
  return {
    id: p.id ?? "l1",
    conversationId: p.id ?? "c1",
    whatsappNumber: "+55",
    status: "new",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...p,
  } as LeadDaFila;
}

describe("o relógio do caso", () => {
  it("sem data não aperta nada — texto puro não muda posição na fila", () => {
    const l = lead({ relogioDoCaso: "as aulas começam em março" });
    expect(diasDoRelogio(l, AGORA)).toBeNull();
    expect(relogioApertado(l, AGORA)).toBe(false);
  });

  it("aperta dentro da janela e não aperta fora dela", () => {
    expect(relogioApertado(lead({ relogioData: "2026-02-20" }), AGORA)).toBe(true);
    expect(relogioApertado(lead({ relogioData: "2026-06-01" }), AGORA)).toBe(false);
  });

  it("a data que já passou continua apertada — ninguém percebeu passar", () => {
    expect(relogioApertado(lead({ relogioData: "2026-01-20" }), AGORA)).toBe(true);
    expect(diasDoRelogio(lead({ relogioData: "2026-01-20" }), AGORA)).toBe(-12);
  });

  it("a borda da janela é inclusiva", () => {
    const naBorda = new Date(Date.parse("2026-02-01T12:00:00Z"));
    const data = new Date(Date.parse("2026-02-01T00:00:00Z") + RELOGIO_APERTADO_DIAS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(relogioApertado(lead({ relogioData: data }), naBorda)).toBe(true);
  });

  it("o rótulo é diferente do rótulo de prazo — as duas coisas não se confundem", () => {
    expect(rotuloRelogio(0)).toBe("é hoje");
    expect(rotuloRelogio(12)).toBe("em 12 dias");
    expect(rotuloRelogio(-3)).toBe("passou há 3 dias");
  });
});

describe("o relógio na fila", () => {
  it("sobe o caso dentro do bloco normal, o mais próximo no topo", () => {
    const fila = montarFila(
      [
        lead({ id: "a", classificacao: "QUENTE_JUDICIAL" }),
        lead({ id: "b", classificacao: "MORNO_ADMINISTRATIVO", relogioData: "2026-02-25" }),
        lead({ id: "c", classificacao: "EXTERIOR_VISTO", relogioData: "2026-02-05" }),
      ],
      AGORA,
    );
    expect(fila.normal.map((l) => l.id)).toEqual(["c", "b", "a"]);
  });

  it("NÃO entra no bloco de prazos e NÃO liga o sinal de prazo processual", () => {
    const apertado = lead({ id: "x", relogioData: "2026-02-03" });
    const fila = montarFila([apertado], AGORA);
    expect(fila.normal.map((l) => l.id)).toEqual(["x"]);
    expect(fila.aConfirmar).toEqual([]);
    expect(fila.correndo).toEqual([]);
    expect(apertado.temPrazoCorrendo).toBeFalsy();
  });

  it("prazo processual continua acima de qualquer relógio apertado", () => {
    const fila = montarFila(
      [
        lead({ id: "relogio", relogioData: "2026-02-02" }),
        lead({ id: "prazo", temPrazoCorrendo: true }),
      ],
      AGORA,
    );
    expect(fila.aConfirmar.map((l) => l.id)).toEqual(["prazo"]);
    expect(fila.normal.map((l) => l.id)).toEqual(["relogio"]);
  });

  it("fora da janela, a ordem de sempre volta a valer", () => {
    const fila = montarFila(
      [
        lead({ id: "a", classificacao: "EXTERIOR_VISTO", relogioData: "2026-09-01" }),
        lead({ id: "b", classificacao: "QUENTE_JUDICIAL" }),
      ],
      AGORA,
    );
    expect(fila.normal.map((l) => l.id)).toEqual(["b", "a"]);
  });
});

describe("a data do relógio é de humano", () => {
  it("o caminho do agente descarta o campo", () => {
    expect(semCamposSoDeHumano({ relogioData: "2026-03-01", relogioDoCaso: "aulas" })).toEqual({
      relogioDoCaso: "aulas",
    });
  });

  it("upsertLead (agente) não grava a data; updateLead (ficha) grava", async () => {
    const repo = new MemoryRepository();
    const { id: conversationId } = await repo.getOrCreateConversation("+5511999999999");

    const doAgente = await repo.upsertLead(conversationId, {
      relogioDoCaso: "as aulas começam em março",
      relogioData: "2026-03-02",
    });
    expect(doAgente.relogioDoCaso).toBe("as aulas começam em março");
    expect(doAgente.relogioData).toBeUndefined();

    const daFicha = await repo.updateLead(doAgente.id, { relogioData: "2026-03-02" });
    expect(daFicha.relogioData).toBe("2026-03-02");
  });
});
