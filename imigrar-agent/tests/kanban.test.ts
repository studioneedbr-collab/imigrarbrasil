import { describe, it, expect } from "vitest";
import { COLUNAS, montarKanban, transicao } from "@/lib/fila/kanban";
import { paginar, paginaDaBusca, avaliarCorte, POR_PAGINA } from "@/lib/fila/paginacao";
import type { LeadDaFila } from "@/lib/fila/ordenacao";

const AGORA = new Date("2026-02-01T12:00:00Z");

function lead(p: Partial<LeadDaFila> = {}): LeadDaFila {
  return {
    id: p.id ?? "l1",
    conversationId: p.id ?? "c1",
    whatsappNumber: "+55",
    status: "new",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-10T00:00:00.000Z",
    ...p,
  } as LeadDaFila;
}

describe("colunas do quadro", () => {
  it("são os status do atendimento, na ordem do trabalho", () => {
    expect(COLUNAS).toEqual(["novo", "em_atendimento", "agendado", "fechado", "perdido"]);
  });

  it("distribui cada lead na sua coluna e trata status ausente como novo", () => {
    const q = montarKanban(
      [
        lead({ id: "a" }),
        lead({ id: "b", atendimentoStatus: "agendado" }),
        lead({ id: "c", atendimentoStatus: "perdido" }),
      ],
      AGORA,
    );
    expect(q.find((c) => c.status === "novo")!.leads.map((l) => l.id)).toEqual(["a"]);
    expect(q.find((c) => c.status === "agendado")!.leads.map((l) => l.id)).toEqual(["b"]);
    expect(q.find((c) => c.status === "perdido")!.leads.map((l) => l.id)).toEqual(["c"]);
  });

  it("conversas filtradas NÃO entram no quadro — desfazer a filtragem pela porta dos fundos", () => {
    const q = montarKanban(
      [
        lead({ id: "curioso", classificacao: "CURIOSO" }),
        lead({ id: "dpu", classificacao: "DPU" }),
        lead({ id: "fora", classificacao: "FORA_ESCOPO" }),
        lead({ id: "caso", classificacao: "MORNO_ADMINISTRATIVO" }),
      ],
      AGORA,
    );
    expect(q.flatMap((c) => c.leads).map((l) => l.id)).toEqual(["caso"]);
  });

  it("nas colunas de trabalho, prazo sobe acima de relógio, e relógio acima do resto", () => {
    const q = montarKanban(
      [
        lead({ id: "comum" }),
        lead({ id: "relogio", relogioData: "2026-02-05" }),
        lead({ id: "prazo", temPrazoCorrendo: true }),
      ],
      AGORA,
    );
    expect(q[0].leads.map((l) => l.id)).toEqual(["prazo", "relogio", "comum"]);
  });

  it("nas colunas de desfecho, o mais recente sobe — ninguém procura o fechado de oito meses atrás", () => {
    const q = montarKanban(
      [
        lead({ id: "velho", atendimentoStatus: "fechado", ultimoContatoEm: "2025-06-01T00:00:00.000Z" }),
        lead({ id: "novo", atendimentoStatus: "fechado", ultimoContatoEm: "2026-01-28T00:00:00.000Z" }),
      ],
      AGORA,
    );
    expect(q.find((c) => c.status === "fechado")!.leads.map((l) => l.id)).toEqual(["novo", "velho"]);
  });
});

describe("transições do arrasto", () => {
  it("soltar na mesma coluna não é ação nenhuma", () => {
    expect(transicao("novo", "novo")).toBeNull();
  });

  it("de novo para em atendimento é assumir — grava responsável e o relógio do 1º contato", () => {
    expect(transicao("novo", "em_atendimento")).toEqual({ acao: "assumir" });
  });

  it("voltar de um desfecho é reabrir, e reabrir NÃO reatribui o caso a quem arrastou", () => {
    expect(transicao("fechado", "em_atendimento")).toEqual({
      acao: "reabrir",
      para: "em_atendimento",
    });
    expect(transicao("perdido", "novo")).toEqual({ acao: "reabrir", para: "novo" });
  });

  it("perdido exige motivo", () => {
    expect(transicao("em_atendimento", "perdido")).toEqual({ acao: "perder", exigeMotivo: true });
  });

  it("toda transição possível vira uma ação que o endpoint já conhece", () => {
    const conhecidas = ["assumir", "agendar", "fechar", "perder", "reabrir"];
    for (const de of COLUNAS) {
      for (const para of COLUNAS) {
        const t = transicao(de, para);
        if (de === para) expect(t).toBeNull();
        else expect(conhecidas, `${de} → ${para}`).toContain(t!.acao);
      }
    }
  });
});

describe("paginação", () => {
  const itens = Array.from({ length: 57 }, (_, i) => i + 1);

  it("corta a fatia e conta certo nas bordas", () => {
    const p1 = paginar(itens, 1);
    expect(p1.itens).toHaveLength(POR_PAGINA);
    expect([p1.de, p1.ate, p1.totalPaginas, p1.total]).toEqual([1, 25, 3, 57]);

    const p3 = paginar(itens, 3);
    expect(p3.itens).toEqual([51, 52, 53, 54, 55, 56, 57]);
    expect([p3.de, p3.ate]).toEqual([51, 57]);
  });

  it("nenhum item se perde entre as páginas", () => {
    const todas = [1, 2, 3].flatMap((p) => paginar(itens, p).itens);
    expect(todas).toEqual(itens);
  });

  it("página fora do intervalo é presa, não devolvida vazia", () => {
    expect(paginar(itens, 99).pagina).toBe(3);
    expect(paginar(itens, 0).pagina).toBe(1);
    expect(paginar(itens, -5).itens[0]).toBe(1);
  });

  it("lista vazia continua tendo uma página", () => {
    const p = paginar([], 1);
    expect([p.totalPaginas, p.total, p.de, p.ate]).toEqual([1, 0, 0, 0]);
  });

  it("lê ?p= sem confiar no que veio", () => {
    expect(paginaDaBusca("3")).toBe(3);
    expect(paginaDaBusca(undefined)).toBe(1);
    expect(paginaDaBusca("abacaxi")).toBe(1);
    expect(paginaDaBusca("-2")).toBe(1);
    expect(paginaDaBusca(["4", "9"])).toBe(4);
  });

  it("o corte só avisa quando cortou de verdade", () => {
    expect(avaliarCorte(500, 1240).cortou).toBe(true);
    expect(avaliarCorte(120, 120).cortou).toBe(false);
  });
});
