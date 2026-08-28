import { describe, it, expect } from "vitest";
import { metricasDeFollowup } from "@/lib/followup/metricas";
import { MOTIVO_ESPERA_LABEL } from "@/lib/followup/motivos";
import type { Lead, ToqueDeFollowup } from "@/lib/domain/types";

const AGORA = new Date("2026-09-02T12:00:00.000Z");
const ROTULOS = { motivo: MOTIVO_ESPERA_LABEL as Record<string, string>, idioma: (c: string) => c };

function toque(p: Partial<ToqueDeFollowup>): ToqueDeFollowup {
  return {
    id: Math.random().toString(36).slice(2),
    conversationId: "c",
    motivo: "consulado",
    canal: "whatsapp",
    texto: "oi",
    status: "enviado",
    toque: 1,
    criadoEm: "2026-09-01T12:00:00.000Z",
    ...p,
  };
}

const lead = (p: Partial<Lead>): Lead =>
  ({ id: "l", conversationId: "c", whatsappNumber: "55", status: "new", stage: "novo", score: 0,
     createdAt: "", updatedAt: "", ...p }) as Lead;

describe("as métricas de follow-up", () => {
  it("separa o que saiu do que ficou na fila", () => {
    const m = metricasDeFollowup(
      [
        toque({ status: "enviado", respondidoEm: "2026-09-02T09:00:00.000Z" }),
        toque({ status: "enviado" }),
        toque({ status: "rascunho" }),
        toque({ status: "pulado" }),
        toque({ status: "tarefa" }),
      ],
      [],
      ROTULOS,
      AGORA,
    );
    // Rascunho não enviado não é mensagem: é fila. Contá-lo derrubaria a taxa de resposta
    // por causa de trabalho que nunca chegou a ninguém.
    expect(m.enviados).toBe(2);
    expect(m.responderam).toBe(1);
    expect(m.taxaGeral).toBe(50);
    expect(m.pulados).toBe(1);
    expect(m.tarefas).toBe(1);
  });

  it("a taxa por idioma usa a língua em que a mensagem SAIU", () => {
    const m = metricasDeFollowup(
      [
        toque({ idioma: "pt", respondidoEm: "x" }),
        toque({ idioma: "pt", respondidoEm: "x" }),
        toque({ idioma: "ht" }),
        toque({ idioma: "ht" }),
      ],
      [],
      ROTULOS,
      AGORA,
    );
    const pt = m.porIdioma.find((l) => l.chave === "pt")!;
    const ht = m.porIdioma.find((l) => l.chave === "ht")!;
    expect(pt.taxa).toBe(100);
    expect(ht.taxa).toBe(0);
  });

  it("sem envio a taxa é nula, não zero — são respostas diferentes", () => {
    const m = metricasDeFollowup([toque({ status: "rascunho" })], [], ROTULOS, AGORA);
    expect(m.taxaGeral).toBeNull();
  });

  it("recuperado se conta por CASO, não por toque", () => {
    const m = metricasDeFollowup(
      [
        toque({ leadId: "a", respondidoEm: "x", toque: 1 }),
        toque({ leadId: "a", respondidoEm: "x", toque: 2 }),
        toque({ leadId: "b", respondidoEm: "x" }),
      ],
      [],
      ROTULOS,
      AGORA,
    );
    expect(m.recuperados).toBe(2);
  });

  it("conta quem se perdeu por esgotamento da sequência", () => {
    const m = metricasDeFollowup(
      [],
      [
        lead({ atendimentoStatus: "perdido", motivoPerdaCategoria: "sumiu" }),
        lead({ atendimentoStatus: "perdido", motivoPerdaCategoria: "preco" }),
        lead({ atendimentoStatus: "fechado" }),
      ],
      ROTULOS,
      AGORA,
    );
    expect(m.perdidosPorEsgotamento).toBe(1);
  });

  it("mede o tempo médio de espera só de quem ainda está esperando", () => {
    const m = metricasDeFollowup(
      [],
      [
        lead({ esperaMotivo: "consulado", esperaDesde: "2026-08-23T12:00:00.000Z" }),
        lead({ esperaMotivo: "consulado", esperaDesde: "2026-08-13T12:00:00.000Z" }),
      ],
      ROTULOS,
      AGORA,
    );
    const consulado = m.esperaMediaDias.find((e) => e.chave === "consulado")!;
    expect(consulado.casos).toBe(2);
    expect(consulado.dias).toBe(15);
  });
});
