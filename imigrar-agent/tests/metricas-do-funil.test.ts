import { describe, it, expect } from "vitest";
import { resumirFunil, diasAteVencer } from "@/lib/metricas/funil";
import type { LeadDaFila } from "@/lib/fila/ordenacao";

/**
 * AS MÉTRICAS DO FUNIL COMERCIAL.
 *
 * A tela media o agente — custo, filtragem, follow-up. Não media o que o escritório
 * pergunta: quanto tem de proposta na rua, quanto fechou, de qual porta veio.
 *
 * O que estes testes travam, mais do que as contas, é a HONESTIDADE dos números: valor
 * que ninguém preencheu não vira zero silencioso, e contar quem entrou não é contar quem
 * fechou.
 */

const AGORA = new Date("2026-09-21T12:00:00Z");
const DE = new Date("2026-09-01T00:00:00Z");

function lead(p: Partial<LeadDaFila>): LeadDaFila {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    conversationId: "c1",
    whatsappNumber: "5511999990000",
    status: "new",
    stage: "novo",
    score: 0,
    createdAt: "2026-09-10T10:00:00Z",
    updatedAt: "2026-09-10T10:00:00Z",
    atendimentoStatus: "novo",
    ...p,
  } as LeadDaFila;
}

describe("a foto de agora", () => {
  it("conta os casos em cada etapa do quadro", () => {
    const m = resumirFunil(
      [
        lead({ atendimentoStatus: "novo" }),
        lead({ atendimentoStatus: "proposta_enviada" }),
        lead({ atendimentoStatus: "proposta_enviada" }),
        lead({ atendimentoStatus: "fechado" }),
      ],
      DE,
      AGORA,
      AGORA,
    );
    const etapa = (s: string) => m.porEtapa.find((e) => e.status === s)?.total;
    expect(etapa("novo")).toBe(1);
    expect(etapa("proposta_enviada")).toBe(2);
    expect(etapa("fechado")).toBe(1);
  });

  it("ensaio não entra em número nenhum", () => {
    const m = resumirFunil(
      [lead({ atendimentoStatus: "fechado", ambiente: "teste", valorContratado: 9999 })],
      DE,
      AGORA,
      AGORA,
    );
    expect(m.fechados.total).toBe(0);
    expect(m.porEtapa.find((e) => e.status === "fechado")?.total).toBe(0);
  });
});

/**
 * O NÚMERO QUE IMPEDE O ZERO DE MENTIR.
 *
 * "R$ 0,00 em propostas" é indistinguível de "não temos proposta nenhuma na rua" e de
 * "temos vinte e ninguém preencheu o valor" — e as duas exigem reações opostas.
 */
describe("valor que ninguém preencheu não vira zero silencioso", () => {
  it("soma só o que tem valor, e conta quantos não têm", () => {
    const m = resumirFunil(
      [
        lead({ atendimentoStatus: "proposta_enviada", propostaValor: 2500 }),
        lead({ atendimentoStatus: "proposta_enviada", propostaValor: 1500 }),
        lead({ atendimentoStatus: "proposta_enviada" }),
        lead({ atendimentoStatus: "proposta_enviada" }),
      ],
      DE,
      AGORA,
      AGORA,
    );
    expect(m.propostas.abertas).toBe(4);
    expect(m.propostas.valor).toBe(4000);
    expect(m.propostas.semValor).toBe(2);
  });

  it("o ticket médio é nulo quando não há valor nenhum — e não zero", () => {
    const m = resumirFunil(
      [lead({ atendimentoStatus: "fechado", updatedAt: "2026-09-15T10:00:00Z" })],
      DE,
      AGORA,
      AGORA,
    );
    expect(m.fechados.total).toBe(1);
    expect(m.fechados.semValor).toBe(1);
    expect(m.fechados.ticketMedio).toBeNull();
  });
});

describe("propostas com prazo", () => {
  it("separa as vencidas das que vencem em breve", () => {
    const m = resumirFunil(
      [
        lead({ atendimentoStatus: "proposta_enviada", propostaValidade: "2026-09-10" }),
        lead({ atendimentoStatus: "proposta_enviada", propostaValidade: "2026-09-25" }),
        lead({ atendimentoStatus: "proposta_enviada", propostaValidade: "2026-12-01" }),
        lead({ atendimentoStatus: "proposta_enviada" }),
      ],
      DE,
      AGORA,
      AGORA,
    );
    expect(m.propostas.vencidas).toBe(1);
    expect(m.propostas.vencemEmBreve).toBe(1);
  });

  it("sem validade escrita, a proposta não conta como vencida", () => {
    expect(diasAteVencer(null, AGORA)).toBeNull();
    expect(diasAteVencer("não é data", AGORA)).toBeNull();
  });
});

/**
 * O desfecho é datado pela ÚLTIMA MEXIDA, não pela entrada: a pergunta é "o que fechou
 * neste mês". Datar por `createdAt` faria todo fechamento de caso antigo sumir do
 * relatório do mês em que ele realmente aconteceu.
 */
describe("o desfecho pertence ao mês em que aconteceu", () => {
  it("caso antigo que fechou agora conta no período", () => {
    const m = resumirFunil(
      [
        lead({
          atendimentoStatus: "fechado",
          createdAt: "2026-01-05T10:00:00Z",
          updatedAt: "2026-09-15T10:00:00Z",
          valorContratado: 3000,
        }),
      ],
      DE,
      AGORA,
      AGORA,
    );
    expect(m.fechados.total).toBe(1);
    expect(m.fechados.valor).toBe(3000);
  });

  it("caso fechado antes do período fica de fora", () => {
    const m = resumirFunil(
      [lead({ atendimentoStatus: "fechado", updatedAt: "2026-05-01T10:00:00Z" })],
      DE,
      AGORA,
      AGORA,
    );
    expect(m.fechados.total).toBe(0);
    expect(m.conversao.comDesfecho).toBe(0);
  });

  it("a conversão é sobre quem teve desfecho, não sobre a base inteira", () => {
    const m = resumirFunil(
      [
        lead({ atendimentoStatus: "fechado", updatedAt: "2026-09-15T10:00:00Z" }),
        lead({ atendimentoStatus: "perdido", updatedAt: "2026-09-16T10:00:00Z" }),
        lead({ atendimentoStatus: "novo" }),
        lead({ atendimentoStatus: "em_atendimento" }),
      ],
      DE,
      AGORA,
      AGORA,
    );
    expect(m.conversao.comDesfecho).toBe(2);
    expect(m.conversao.taxa).toBe(0.5);
  });
});

/**
 * Contar só a entrada faz a porta mais barulhenta parecer a melhor: a campanha que traz
 * cem curiosos e a indicação que traz três clientes aparecem como 100 e 3.
 */
describe("de onde vieram — e quanto cada porta fechou", () => {
  it("separa entrada de fechamento por origem", () => {
    const m = resumirFunil(
      [
        lead({ origem: "site", atendimentoStatus: "novo" }),
        lead({ origem: "site", atendimentoStatus: "novo" }),
        lead({ origem: "site", atendimentoStatus: "novo" }),
        lead({ origem: "importacao", atendimentoStatus: "fechado", valorContratado: 5000 }),
      ],
      DE,
      AGORA,
      AGORA,
    );
    const site = m.porOrigem.find((o) => o.origem === "site")!;
    const planilha = m.porOrigem.find((o) => o.origem === "importacao")!;
    expect(site.total).toBe(3);
    expect(site.fechados).toBe(0);
    expect(planilha.total).toBe(1);
    expect(planilha.valor).toBe(5000);
  });

  it("lead sem origem gravada conta como WhatsApp — a porta que existia antes das outras", () => {
    const m = resumirFunil([lead({ origem: undefined })], DE, AGORA, AGORA);
    expect(m.porOrigem[0].origem).toBe("whatsapp");
  });
});
