import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRepository } from "@/lib/data/memory-repository";
import { paginaDoServidor, POR_PAGINA } from "@/lib/fila/paginacao";

// A tela inicial mostrava "42 atendimentos mais recentes, de 43". Aquilo não era
// paginação: era um teto de carga, com um aviso amarelo avisando que faltava coisa sem
// dizer qual. Duas consequências, e a segunda é a grave:
//
//   1. o denominador contava a tabela inteira (com ensaio, filtradas e casos encerrados),
//      então o aviso aparecia mesmo quando NADA tinha sido cortado;
//   2. os blocos de prazo dependiam de caber no teto — e um caso com prazo que não coube
//      é um prazo que ninguém viu.

const leadBase = {
  contactName: "Alguém",
  clientType: "Venezuela",
  region: "Boa Vista",
  servicesInterested: ["regularização"],
};

describe("a fila paginada", () => {
  let repo: MemoryRepository;

  async function criarLead(numero: string, patch: Record<string, unknown> = {}) {
    const conv = await repo.getOrCreateConversation(numero);
    return repo.upsertLead(conv.id, { ...leadBase, ...patch });
  }

  beforeEach(() => {
    repo = new MemoryRepository();
  });

  it("TODOS os casos com prazo vêm, mesmo que sejam mais do que cabe numa página", async () => {
    // A regra inegociável: se houver quarenta casos com prazo, os quarenta aparecem.
    for (let i = 0; i < POR_PAGINA + 15; i++) {
      await criarLead(`55950000${String(1000 + i)}`, { temPrazoCorrendo: true });
    }
    const r = await repo.listLeadsDaFila({ pagina: 1, porPagina: POR_PAGINA });
    expect(r.comPrazo).toHaveLength(POR_PAGINA + 15);
    expect(r.normal).toHaveLength(0);
  });

  it("o prazo entra pelos três caminhos — booleano, classificação e data confirmada", async () => {
    await criarLead("5595000010001", { temPrazoCorrendo: true });
    await criarLead("5595000010002", { classificacao: "QUENTE_PRAZO" });
    // A data de prazo NÃO entra por `upsertLead` — o repositório a recusa de propósito,
    // porque quem grava data é uma pessoa que ligou e confirmou. Ver `confirmarPrazo`.
    const comData = await criarLead("5595000010003");
    await repo.confirmarPrazo(
      comData.id,
      { tipo: "multa", limite: "2026-09-10" },
      "shayene@imigrarbrasil.com.br",
    );
    await criarLead("5595000010004", {});
    const r = await repo.listLeadsDaFila({ pagina: 1, porPagina: POR_PAGINA });
    expect(r.comPrazo).toHaveLength(3);
    expect(r.normal).toHaveLength(1);
  });

  it("só o bloco 3 pagina, e o total é o do banco", async () => {
    for (let i = 0; i < POR_PAGINA + 7; i++) {
      await criarLead(`55950000${String(2000 + i)}`);
    }
    const p1 = await repo.listLeadsDaFila({ pagina: 1, porPagina: POR_PAGINA });
    const p2 = await repo.listLeadsDaFila({ pagina: 2, porPagina: POR_PAGINA });
    expect(p1.normal).toHaveLength(POR_PAGINA);
    expect(p2.normal).toHaveLength(7);
    expect(p1.totalNormal).toBe(POR_PAGINA + 7);
    // Nenhum caso aparece nas duas páginas — o corte é do banco, não da tela.
    const ids = new Set([...p1.normal, ...p2.normal].map((l) => l.id));
    expect(ids.size).toBe(POR_PAGINA + 7);
  });

  it("ensaio, conversa filtrada e caso encerrado não entram — nem no total", async () => {
    await criarLead("5595000030001");
    await criarLead("sim:um-ensaio");
    // `fb:` é a suíte do motor determinístico. Ela um dia rodou contra o banco de
    // produção e deixou dezenas de conversas lá, marcadas como `producao` — cinco delas
    // com lead, sentadas na fila de trabalho como se fossem casos de gente.
    await criarLead("fb:um-teste");
    await criarLead("5595000030002", { classificacao: "CURIOSO" });
    await criarLead("5595000030003", { atendimentoStatus: "fechado" });
    await criarLead("5595000030004", { atendimentoStatus: "perdido" });

    const r = await repo.listLeadsDaFila({ pagina: 1, porPagina: POR_PAGINA });
    expect(r.normal).toHaveLength(1);
    // O denominador é o mesmo recorte do numerador. Era a falta disso que fazia o aviso
    // amarelo aparecer sem nada ter sido cortado.
    expect(r.totalNormal).toBe(1);
    expect(r.totalFiltradas).toBe(1);
  });
});

describe("a página que o banco já cortou", () => {
  it("descreve onde a fatia está, sem refatiar nada", () => {
    const p = paginaDoServidor(["d", "e", "f"], 2, 3, 8);
    expect(p.itens).toEqual(["d", "e", "f"]);
    expect(p.de).toBe(4);
    expect(p.ate).toBe(6);
    expect(p.totalPaginas).toBe(3);
  });

  it("página fora do intervalo é presa no intervalo, não devolvida vazia", () => {
    // Um link antigo com ?p=9 numa lista que encolheu mostraria tela em branco, e quem vê
    // tela em branco acha que perdeu os dados.
    expect(paginaDoServidor([], 9, 25, 10).pagina).toBe(1);
  });

  it("lista vazia não inventa um primeiro item", () => {
    const p = paginaDoServidor([], 1, 25, 0);
    expect(p.de).toBe(0);
    expect(p.ate).toBe(0);
  });
});
