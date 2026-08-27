import { describe, it, expect } from "vitest";
import {
  FUNIL_PADRAO,
  etapasPadrao,
  faltamDesfechos,
  funilPadrao,
  montarQuadro,
} from "@/lib/crm/funil";
import type { EtapaCrm, FunilCrm } from "@/lib/domain/types";
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

const juridico: FunilCrm = {
  id: "f-jur",
  nome: "Jurídico",
  ordem: 1,
  padrao: false,
  arquivado: false,
  criadoEm: "2026-01-01T00:00:00.000Z",
};

/** Duas etapas com o MESMO status: é o caso que o quadro antigo não sabia representar. */
const etapasJuridico: EtapaCrm[] = [
  { id: "e-novo", funilId: "f-jur", nome: "Chegou", status: "novo", ordem: 0, arquivada: false },
  { id: "e-doc", funilId: "f-jur", nome: "Aguardando certidão", status: "em_atendimento", ordem: 1, arquivada: false },
  { id: "e-prot", funilId: "f-jur", nome: "Protocolo enviado", status: "em_atendimento", ordem: 2, arquivada: false },
  { id: "e-fim", funilId: "f-jur", nome: "Resolvido", status: "fechado", ordem: 3, arquivada: false },
];

describe("o funil padrão", () => {
  it("tem uma etapa por status, na ordem do trabalho", () => {
    expect(etapasPadrao().map((e) => e.status)).toEqual([
      "novo", "em_atendimento", "agendado", "fechado", "perdido",
    ]);
  });

  it("é o escolhido quando ninguém escolheu, e sobra o primeiro quando não há padrão", () => {
    expect(funilPadrao([juridico, FUNIL_PADRAO]).id).toBe(FUNIL_PADRAO.id);
    expect(funilPadrao([juridico]).id).toBe(juridico.id);
    expect(funilPadrao([]).id).toBe(FUNIL_PADRAO.id);
  });
});

describe("o quadro do CRM", () => {
  it("quem nunca foi movido cai na PRIMEIRA etapa do seu status — não some", () => {
    const q = montarQuadro(
      [
        lead({ id: "a", funilId: "f-jur", atendimentoStatus: "em_atendimento" }),
        lead({ id: "b", funilId: "f-jur", atendimentoStatus: "fechado" }),
      ],
      juridico,
      etapasJuridico,
      AGORA,
    );
    expect(q.find((c) => c.etapa.id === "e-doc")!.leads.map((l) => l.id)).toEqual(["a"]);
    expect(q.find((c) => c.etapa.id === "e-prot")!.leads).toEqual([]);
    expect(q.find((c) => c.etapa.id === "e-fim")!.leads.map((l) => l.id)).toEqual(["b"]);
  });

  it("respeita a etapa gravada quando ela ainda descreve o status do caso", () => {
    const q = montarQuadro(
      [lead({ id: "a", funilId: "f-jur", etapaId: "e-prot", atendimentoStatus: "em_atendimento" })],
      juridico,
      etapasJuridico,
      AGORA,
    );
    expect(q.find((c) => c.etapa.id === "e-prot")!.leads.map((l) => l.id)).toEqual(["a"]);
  });

  it("etapa que não descreve mais o status é ignorada — o card conta a verdade", () => {
    // Fechado pelo detalhe, sem passar pelo quadro: o card não pode continuar em
    // "Protocolo enviado" enquanto o caso está fechado.
    const q = montarQuadro(
      [lead({ id: "a", funilId: "f-jur", etapaId: "e-prot", atendimentoStatus: "fechado" })],
      juridico,
      etapasJuridico,
      AGORA,
    );
    expect(q.find((c) => c.etapa.id === "e-fim")!.leads.map((l) => l.id)).toEqual(["a"]);
  });

  it("etapa arquivada ou de outro funil também devolve o caso pelo status", () => {
    const q = montarQuadro(
      [lead({ id: "a", funilId: "f-jur", etapaId: "de-outro-funil", atendimentoStatus: "novo" })],
      juridico,
      etapasJuridico,
      AGORA,
    );
    expect(q.find((c) => c.etapa.id === "e-novo")!.leads.map((l) => l.id)).toEqual(["a"]);
  });

  it("o caso aparece em UM funil só — sem funil pertence ao padrão", () => {
    const leads = [lead({ id: "sem-funil" }), lead({ id: "do-juridico", funilId: "f-jur" })];
    const noJuridico = montarQuadro(leads, juridico, etapasJuridico, AGORA);
    const noPadrao = montarQuadro(leads, FUNIL_PADRAO, etapasPadrao(), AGORA);
    expect(noJuridico.flatMap((c) => c.leads).map((l) => l.id)).toEqual(["do-juridico"]);
    expect(noPadrao.flatMap((c) => c.leads).map((l) => l.id)).toEqual(["sem-funil"]);
  });

  it("filtradas e ensaios continuam fora do quadro", () => {
    const q = montarQuadro(
      [
        lead({ id: "curioso", funilId: "f-jur", classificacao: "CURIOSO" }),
        lead({ id: "ensaio", funilId: "f-jur", ambiente: "teste" }),
        lead({ id: "caso", funilId: "f-jur", classificacao: "MORNO_ADMINISTRATIVO" }),
      ],
      juridico,
      etapasJuridico,
      AGORA,
    );
    expect(q.flatMap((c) => c.leads).map((l) => l.id)).toEqual(["caso"]);
  });

  it("dentro da coluna, prazo sobe acima de relógio, e relógio acima do resto", () => {
    const q = montarQuadro(
      [
        lead({ id: "comum", funilId: "f-jur", atendimentoStatus: "em_atendimento" }),
        lead({ id: "relogio", funilId: "f-jur", atendimentoStatus: "em_atendimento", relogioData: "2026-02-05" }),
        lead({ id: "prazo", funilId: "f-jur", atendimentoStatus: "em_atendimento", temPrazoCorrendo: true }),
      ],
      juridico,
      etapasJuridico,
      AGORA,
    );
    expect(q.find((c) => c.etapa.id === "e-doc")!.leads.map((l) => l.id)).toEqual([
      "prazo", "relogio", "comum",
    ]);
  });
});

describe("um funil de onde não se sai", () => {
  it("avisa quando falta etapa de desfecho", () => {
    expect(faltamDesfechos(etapasPadrao())).toEqual([]);
    expect(faltamDesfechos(etapasJuridico)).toEqual(["perdido"]);
  });
});
