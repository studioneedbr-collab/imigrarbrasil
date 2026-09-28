// A ANA MOVE O CARD SOZINHA — E SÓ ONDE NINGUÉM MEXEU.
//
// O veredito de qualificação já existia, mas era gravado em `stage`, do funil comercial
// antigo. A coluna do CRM é `atendimentoStatus`, e ela nunca era tocada: o sistema decidia
// "esta pessoa descreveu um caso com prazo correndo" e o card continuava em "Novo lead" ao
// lado de quem mandou "oi" e sumiu. A primeira coluna virava a lista de tudo.
//
// O que se testa aqui é o que a automação NÃO pode fazer. Mover card é reorganizar o
// trabalho de outras pessoas, e o defeito perigoso não é deixar de promover — é promover
// por cima de uma decisão que alguém tomou.

import { describe, it, expect } from "vitest";
import { promocaoDoAtendimento } from "@/lib/crm/promocao";

const lead = (p: Record<string, unknown> = {}) =>
  ({ atendimentoStatus: "novo", classificacao: null, ...p }) as never;

describe("promove quando há caso de verdade", () => {
  it("sobe de novo para em atendimento com veredito qualificado", () => {
    expect(promocaoDoAtendimento({ lead: lead(), veredito: "qualificado" })).toBe("em_atendimento");
  });

  it("prioritário também promove", () => {
    expect(promocaoDoAtendimento({ lead: lead(), veredito: "prioritario" })).toBe("em_atendimento");
  });

  // Lead recém-criado pelo webhook não tem status nenhum. Ele conta como novo.
  it("lead sem status ainda é novo", () => {
    expect(promocaoDoAtendimento({ lead: lead({ atendimentoStatus: null }), veredito: "qualificado" }))
      .toBe("em_atendimento");
  });
});

describe("não promove por conversa comprida", () => {
  // O critério antigo era `score >= 45`, que subia quem apenas conversou bastante. O
  // veredito exige caso descrito com intenção declarada ou prazo correndo.
  it("veredito de curioso não move nada", () => {
    expect(promocaoDoAtendimento({ lead: lead(), veredito: "curioso" })).toBeNull();
  });

  it("sem veredito não move nada", () => {
    expect(promocaoDoAtendimento({ lead: lead(), veredito: null })).toBeNull();
  });
});

describe("não desfaz decisão de gente", () => {
  // O caro não é deixar de promover: é promover por cima de alguém.
  for (const status of ["em_atendimento", "proposta_enviada", "agendado", "fechado", "perdido"]) {
    it(`não mexe em quem já está em "${status}"`, () => {
      expect(
        promocaoDoAtendimento({ lead: lead({ atendimentoStatus: status }), veredito: "prioritario" }),
      ).toBeNull();
    });
  }
});

describe("conversa filtrada não entra no quadro pela porta dos fundos", () => {
  // Curioso, DPU e fora de escopo vivem na aba de auditoria. Promovê-los seria desfazer a
  // filtragem — e a filtragem existe para o time não ver o que a Ana já resolveu.
  for (const c of ["curioso", "dpu", "fora_escopo"]) {
    it(`"${c}" não é promovido nem com veredito prioritário`, () => {
      expect(
        promocaoDoAtendimento({ lead: lead({ classificacao: c }), veredito: "prioritario" }),
      ).toBeNull();
    });
  }
});

describe("sem lead não há o que promover", () => {
  it("devolve nulo", () => {
    expect(promocaoDoAtendimento({ lead: null, veredito: "qualificado" })).toBeNull();
  });
});
