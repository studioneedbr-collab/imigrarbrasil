import { describe, it, expect } from "vitest";
import { calcularMetricas } from "@/lib/metricas";
import { MemoryRepository } from "@/lib/data/memory-repository";
import type { LeadDaFila } from "@/lib/fila/ordenacao";
import type { Reclassificacao } from "@/lib/domain/types";

const DE = new Date("2026-08-01T00:00:00Z");
const ATE = new Date("2026-08-31T23:59:59Z");
const AGORA = new Date("2026-08-26T15:00:00Z");

const lead = (patch: Partial<LeadDaFila> = {}): LeadDaFila =>
  ({
    id: "l1", conversationId: "c1", whatsappNumber: "5521999999999",
    status: "new", stage: "novo", score: 0,
    createdAt: "2026-08-10T12:00:00Z", updatedAt: "2026-08-10T12:00:00Z",
    atendimentoStatus: "novo", temPrazoCorrendo: false,
    ...patch,
  }) as LeadDaFila;

describe("as métricas que este time acompanha", () => {
  it("conta o que foi filtrado — o número que justifica o projeto", () => {
    const m = calcularMetricas(
      [
        lead({ id: "1", classificacao: "CURIOSO" }),
        lead({ id: "2", classificacao: "DPU" }),
        lead({ id: "3", classificacao: "FORA_ESCOPO" }),
        lead({ id: "4", classificacao: "QUENTE_PRAZO" }),
      ],
      [], DE, ATE, AGORA,
    );
    expect(m.filtradas.total).toBe(3);
    expect(m.qualificados.total).toBe(1);
  });

  it("agrupa por idioma e mostra quem ficou sem idioma detectado", () => {
    const m = calcularMetricas(
      [lead({ id: "1", idioma: "es" }), lead({ id: "2", idioma: "es" }), lead({ id: "3" })],
      [], DE, ATE, AGORA,
    );
    expect(m.porIdioma[0]).toEqual({ idioma: "es", total: 2 });
    expect(m.porIdioma).toContainEqual({ idioma: "—", total: 1 });
  });

  it("a taxa de resgate não cai justamente quando o resgate sobe", () => {
    // O resgatado sai do conjunto de filtrados. Se a base fosse só "o que continua
    // filtrado", cada resgate encolheria numerador e denominador ao mesmo tempo e a
    // métrica que protege o projeto ficaria cega.
    const m = calcularMetricas(
      [
        lead({ id: "1", classificacao: "CURIOSO" }),
        lead({ id: "2", classificacao: "MORNO_ADMINISTRATIVO", resgatadoEm: "2026-08-12T10:00:00Z" }),
      ],
      [], DE, ATE, AGORA,
    );
    expect(m.resgate).toMatchObject({ resgatados: 1, base: 2 });
    expect(m.resgate.taxa).toBeCloseTo(0.5);
  });

  it("mede a discordância do humano uma vez por lead, não por clique", () => {
    const reclass: Reclassificacao[] = [
      { id: "r1", leadId: "1", de: "CURIOSO", para: "MORNO_ADMINISTRATIVO", autor: "a", criadoEm: "2026-08-11T10:00:00Z" },
      { id: "r2", leadId: "1", de: "MORNO_ADMINISTRATIVO", para: "QUENTE_JUDICIAL", autor: "a", criadoEm: "2026-08-12T10:00:00Z" },
    ];
    const m = calcularMetricas(
      [lead({ id: "1", classificacaoIa: "CURIOSO", classificacao: "QUENTE_JUDICIAL" }),
       lead({ id: "2", classificacaoIa: "MORNO_ADMINISTRATIVO", classificacao: "MORNO_ADMINISTRATIVO" })],
      reclass, DE, ATE, AGORA,
    );
    expect(m.reclassificacao).toMatchObject({ reclassificados: 1, base: 2 });
  });

  it("separa o tempo até o humano no caso com prazo", () => {
    const m = calcularMetricas(
      [
        lead({ id: "1", classificacao: "QUENTE_PRAZO", temPrazoCorrendo: true,
               createdAt: "2026-08-10T12:00:00Z", assumidoEm: "2026-08-10T12:30:00Z" }),
        lead({ id: "2", classificacao: "MORNO_ADMINISTRATIVO",
               createdAt: "2026-08-10T12:00:00Z", assumidoEm: "2026-08-11T12:00:00Z" }),
      ],
      [], DE, ATE, AGORA,
    );
    expect(m.tempoAteHumano.quentePrazoMin).toBe(30);
    expect(m.tempoAteHumano.geralMin).toBe(735); // a média geral esconde os 30 minutos
  });

  it("prazos perdidos aparecem mesmo fora do período do relatório", () => {
    // A contagem é do estado ATUAL, não do recorte: um prazo perdido em julho continua
    // perdido em agosto, e precisa continuar visível.
    const m = calcularMetricas(
      [lead({ id: "1", createdAt: "2026-07-01T12:00:00Z", prazoDataLimite: "2026-07-20", prazoConfirmadoPor: "a" })],
      [], DE, ATE, AGORA,
    );
    expect(m.atendidas).toBe(0);
    expect(m.prazosPerdidos).toHaveLength(1);
  });
});

describe("resgate, reclassificação e retenção no repositório", () => {
  it("reclassificar de filtrada para fila marca o resgate", async () => {
    const repo = new MemoryRepository();
    const conv = await repo.getOrCreateConversation("5521999999999");
    const l = await repo.upsertLead(conv.id, { classificacao: "CURIOSO" });
    const resgatado = await repo.reclassificarLead(l.id, "QUENTE_JUDICIAL", "ana@x", "tinha caso sim");
    expect(resgatado.resgatadoEm).toBeTruthy();
    expect(resgatado.resgatadoPor).toBe("ana@x");
    const [reg] = await repo.listReclassificacoes();
    expect(reg).toMatchObject({ de: "CURIOSO", para: "QUENTE_JUDICIAL", autor: "ana@x" });
  });

  it("a classificação original da IA sobrevive à correção humana", async () => {
    const repo = new MemoryRepository();
    const conv = await repo.getOrCreateConversation("5521999999999");
    const l = await repo.upsertLead(conv.id, { classificacao: "CURIOSO" });
    await repo.reclassificarLead(l.id, "QUENTE_JUDICIAL", "ana@x");
    const depois = await repo.getLead(l.id);
    expect(depois?.classificacaoIa).toBe("CURIOSO");
    expect(depois?.classificacao).toBe("QUENTE_JUDICIAL");
  });

  it("a retenção não apaga quem foi resgatado", async () => {
    const repo = new MemoryRepository();
    const a = await repo.getOrCreateConversation("5521111111111");
    const b = await repo.getOrCreateConversation("5521222222222");
    await repo.upsertLead(a.id, { classificacao: "CURIOSO" });
    const lb = await repo.upsertLead(b.id, { classificacao: "CURIOSO" });
    await repo.reclassificarLead(lb.id, "MORNO_ADMINISTRATIVO", "ana@x");
    // dias = 0: tudo que não estiver protegido está vencido.
    expect(await repo.purgarDescartados(0)).toBe(1);
    expect(await repo.getLead(lb.id)).not.toBeNull();
  });
});
