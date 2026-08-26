import { describe, it, expect } from "vitest";
import {
  atividadeDaConversa,
  movimentacaoDoLead,
  diaEmBrasilia,
  inicioDoDiaEmBrasilia,
  inicioDaJanela,
  bucketsPorDia,
} from "@/lib/dashboard/periodo";

/**
 * O painel dizia "Conversas hoje: 0" com o agente tendo trocado 45 mensagens no dia.
 *
 * Duas causas, as duas reproduzidas aqui com os dados REAIS de produção de 17/08/2026:
 *
 * 1. O painel contava conversa por `created_at` — quantas NASCERAM no período — e rotulava
 *    isso como "Volume de atendimento". As quatro conversas atendidas naquele dia eram de
 *    clientes que voltaram (criadas em 07, 10, 15 e 16 de agosto), então o dia dava zero.
 *    Com follow-up de 24h e reinício de conversa, cliente que volta é a regra, não exceção.
 *
 * 2. "Hoje" saía do relógio do servidor, que na Vercel é UTC. Meia-noite UTC são 21h no
 *    Rio: das 21h à meia-noite o painel já contava o dia seguinte. É a mesma armadilha que
 *    lib/agent/index.ts já resolve para a saudação da Ana.
 */

// As quatro conversas que tiveram atividade em 17/08/2026, como estão no banco.
const CONVERSAS_REAIS = [
  { createdAt: "2026-08-15T14:48:03.928Z", lastMessageAt: "2026-08-17T16:04:25.558Z", status: "waiting" },
  { createdAt: "2026-08-07T14:34:09.400Z", lastMessageAt: "2026-08-17T12:49:49.676Z", status: "negotiating" },
  { createdAt: "2026-08-16T15:35:47.879Z", lastMessageAt: "2026-08-17T15:40:54.626Z", status: "waiting" },
  { createdAt: "2026-08-10T18:23:34.218Z", lastMessageAt: "2026-08-17T19:38:56.244Z", status: "waiting" },
  // Esta se movimentou por último em 16/08 — não conta como atividade de 17/08.
  { createdAt: "2026-08-16T17:45:51.290Z", lastMessageAt: "2026-08-16T18:04:21.484Z", status: "transferred" },
];

// 17/08/2026, 19:11 de Brasília (22:11 UTC) — o instante em que o problema foi observado.
const AGORA = new Date("2026-08-17T22:11:42.508Z");

describe("período do painel — dia de calendário em Brasília", () => {
  it("o dia vem do fuso de Brasília, não do relógio do servidor", () => {
    // 23:00 no Rio de 16/08 é 02:00 UTC de 17/08. O servidor UTC diria "17"; para quem
    // opera no Rio ainda é dia 16, e é o dia 16 que tem de aparecer no painel.
    expect(diaEmBrasilia(new Date("2026-08-17T02:00:00Z"))).toBe("2026-08-16");
    expect(diaEmBrasilia(AGORA)).toBe("2026-08-17");
  });

  it("o dia começa às 00:00 de Brasília (03:00 UTC), não às 00:00 UTC", () => {
    expect(inicioDoDiaEmBrasilia(AGORA).toISOString()).toBe("2026-08-17T03:00:00.000Z");
    // Às 22h do Rio o dia ainda é o mesmo — antes, o painel já teria virado.
    expect(inicioDoDiaEmBrasilia(new Date("2026-08-18T01:30:00Z")).toISOString()).toBe(
      "2026-08-17T03:00:00.000Z",
    );
  });

  it("a janela de N dias termina hoje e inclui o dia inteiro de N-1 dias atrás", () => {
    expect(inicioDaJanela(AGORA, 1).toISOString()).toBe("2026-08-17T03:00:00.000Z");
    expect(inicioDaJanela(AGORA, 7).toISOString()).toBe("2026-08-11T03:00:00.000Z");
  });
});

describe("atendimento é atividade, não criação", () => {
  it("a conversa conta pela última mensagem, não pela data de nascimento", () => {
    expect(atividadeDaConversa(CONVERSAS_REAIS[0])).toBe("2026-08-17T16:04:25.558Z");
    // Sem última mensagem registrada, cai na criação.
    expect(atividadeDaConversa({ createdAt: "2026-08-01T10:00:00Z" })).toBe("2026-08-01T10:00:00Z");
    expect(atividadeDaConversa({ createdAt: "2026-08-01T10:00:00Z", lastMessageAt: null })).toBe(
      "2026-08-01T10:00:00Z",
    );
  });

  it("REGRESSÃO: 17/08/2026 tinha 4 conversas atendidas e 0 criadas", () => {
    const inicio = inicioDaJanela(AGORA, 1).getTime();
    const atendidas = CONVERSAS_REAIS.filter((c) => new Date(atividadeDaConversa(c)).getTime() >= inicio);
    const criadas = CONVERSAS_REAIS.filter((c) => new Date(c.createdAt).getTime() >= inicio);
    expect(atendidas).toHaveLength(4); // o que o painel deveria ter mostrado
    expect(criadas).toHaveLength(0); // o que ele mostrava
  });

  it("o lead conta pela última movimentação", () => {
    expect(movimentacaoDoLead({ createdAt: "2026-08-13T17:57:03Z", updatedAt: "2026-08-17T16:05:00Z" })).toBe(
      "2026-08-17T16:05:00Z",
    );
    expect(movimentacaoDoLead({ createdAt: "2026-08-13T17:57:03Z" })).toBe("2026-08-13T17:57:03Z");
  });

  it("a taxa de qualificação sai sobre as conversas atendidas no período", () => {
    const inicio = inicioDaJanela(AGORA, 1).getTime();
    const atendidas = CONVERSAS_REAIS.filter((c) => new Date(atividadeDaConversa(c)).getTime() >= inicio);
    const qualificadas = atendidas.filter((c) =>
      ["negotiating", "transferred", "finished"].includes(c.status),
    ).length;
    expect(Math.round((qualificadas / atendidas.length) * 100)).toBe(25);
  });
});

describe("buckets do gráfico", () => {
  it("agrupa por dia de Brasília e põe a atividade de hoje no último balde", () => {
    const buckets = bucketsPorDia(
      CONVERSAS_REAIS.map((c) => ({ quando: atividadeDaConversa(c) })),
      7,
      AGORA,
    );
    expect(buckets).toHaveLength(7);
    expect(buckets[6]).toBe(4); // hoje, 17/08
    expect(buckets[5]).toBe(1); // ontem, 16/08
    expect(buckets.reduce((a, b) => a + b, 0)).toBe(5);
  });

  it("soma peso quando informado (pipeline em reais)", () => {
    const buckets = bucketsPorDia(
      [{ quando: "2026-08-17T12:49:46.453Z", peso: 26211.54 }],
      1,
      AGORA,
    );
    expect(buckets[0]).toBeCloseTo(26211.54, 2);
  });

  it("ignora o que está fora da janela em vez de empilhar no primeiro balde", () => {
    const buckets = bucketsPorDia([{ quando: "2026-07-01T12:00:00Z" }], 7, AGORA);
    expect(buckets.reduce((a, b) => a + b, 0)).toBe(0);
  });
});
