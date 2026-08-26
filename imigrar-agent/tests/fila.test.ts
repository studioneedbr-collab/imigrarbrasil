import { describe, it, expect } from "vitest";
import {
  diasRestantes,
  faixaDoPrazo,
  montarFila,
  prazosPerdidos,
  rotuloPrazo,
  type LeadDaFila,
} from "@/lib/fila/ordenacao";
import type { Lead } from "@/lib/domain/types";

const AGORA = new Date("2026-08-26T15:00:00Z"); // 12h em Brasília

const lead = (patch: Partial<LeadDaFila> = {}): LeadDaFila =>
  ({
    id: "l1", conversationId: "c1", whatsappNumber: "5521999999999",
    status: "new", stage: "novo", score: 0,
    createdAt: "2026-08-20T12:00:00Z", updatedAt: "2026-08-20T12:00:00Z",
    atendimentoStatus: "novo", temPrazoCorrendo: false,
    ...patch,
  }) as LeadDaFila;

describe("dias restantes e faixas", () => {
  it("conta dia de calendário, não 24h", () => {
    // 23h de Brasília: o dia ainda é 26, e um prazo no dia 27 é "amanhã" — não "0,04 dia".
    const tarde = new Date("2026-08-27T02:00:00Z"); // 23h do dia 26 em Brasília
    expect(diasRestantes("2026-08-27", tarde)).toBe(1);
  });

  it("não adianta um dia por causa do relógio UTC da Vercel", () => {
    // Das 21h à meia-noite o servidor já está no dia seguinte em UTC. Se o "hoje" saísse
    // dali, todo prazo apareceria um dia mais curto do que é, toda noite.
    const noite = new Date("2026-08-27T01:00:00Z"); // 22h do dia 26 em Brasília
    expect(diasRestantes("2026-08-26", noite)).toBe(0);
  });

  it("separa as três faixas e o vencido", () => {
    expect(faixaDoPrazo(-1)).toBe("vencido");
    expect(faixaDoPrazo(0)).toBe("critico");
    expect(faixaDoPrazo(3)).toBe("critico");
    expect(faixaDoPrazo(4)).toBe("atencao");
    expect(faixaDoPrazo(7)).toBe("atencao");
    expect(faixaDoPrazo(8)).toBe("acompanhamento");
  });

  it("o rótulo é inequívoco: 'vence hoje' não é '0 dias'", () => {
    expect(rotuloPrazo(0)).toBe("vence hoje");
    expect(rotuloPrazo(1)).toBe("vence amanhã");
    expect(rotuloPrazo(-1)).toBe("vencido ontem");
    expect(rotuloPrazo(-3)).toBe("vencido há 3 dias");
  });
});

describe("a fila", () => {
  it("põe prazo a confirmar acima de prazo confirmado, mesmo vencendo amanhã", () => {
    // Um prazo confirmado é risco medido; um prazo sem data é risco de tamanho
    // desconhecido — e a única forma de saber é ligar.
    const semData = lead({ id: "sem-data", temPrazoCorrendo: true });
    const amanha = lead({ id: "amanha", prazoDataLimite: "2026-08-27", prazoConfirmadoPor: "ana@x" });
    const fila = montarFila([amanha, semData], AGORA);
    expect(fila.aConfirmar.map((l) => l.id)).toEqual(["sem-data"]);
    expect(fila.correndo.map((i) => i.lead.id)).toEqual(["amanha"]);
  });

  it("no bloco 1, quem espera confirmação há mais tempo vem primeiro", () => {
    const antigo = lead({ id: "antigo", temPrazoCorrendo: true, createdAt: "2026-08-18T09:00:00Z" });
    const novo = lead({ id: "novo", temPrazoCorrendo: true, createdAt: "2026-08-25T09:00:00Z" });
    expect(montarFila([novo, antigo], AGORA).aConfirmar.map((l) => l.id)).toEqual(["antigo", "novo"]);
  });

  it("classificado como QUENTE_PRAZO sem o booleano ainda cai no bloco de prazo", () => {
    const l = lead({ id: "x", classificacao: "QUENTE_PRAZO", temPrazoCorrendo: false });
    expect(montarFila([l], AGORA).aConfirmar.map((i) => i.id)).toEqual(["x"]);
  });

  it("ordena prazos correndo por data limite crescente", () => {
    const leads = [
      lead({ id: "c", prazoDataLimite: "2026-09-10", prazoConfirmadoPor: "a" }),
      lead({ id: "a", prazoDataLimite: "2026-08-27", prazoConfirmadoPor: "a" }),
      lead({ id: "b", prazoDataLimite: "2026-08-30", prazoConfirmadoPor: "a" }),
    ];
    expect(montarFila(leads, AGORA).correndo.map((i) => i.lead.id)).toEqual(["a", "b", "c"]);
  });

  it("prazo vencido continua visível até alguém fechar", () => {
    const vencido = lead({ id: "v", prazoDataLimite: "2026-08-20", prazoConfirmadoPor: "a" });
    const fila = montarFila([vencido], AGORA);
    expect(fila.correndo[0].faixa).toBe("vencido");
    expect(prazosPerdidos([vencido], AGORA)).toHaveLength(1);
  });

  it("fechado sai da fila e para de contar como prazo perdido", () => {
    const fechado = lead({
      id: "f", prazoDataLimite: "2026-08-20", prazoConfirmadoPor: "a", atendimentoStatus: "fechado",
    });
    expect(montarFila([fechado], AGORA).correndo).toHaveLength(0);
    expect(prazosPerdidos([fechado], AGORA)).toHaveLength(0);
  });

  it("bloco 3: judicial primeiro, e dentro do grupo o mais parado no topo", () => {
    const leads = [
      lead({ id: "exterior", classificacao: "EXTERIOR_VISTO", ultimoContatoEm: "2026-08-10T12:00:00Z" }),
      lead({ id: "morno-novo", classificacao: "MORNO_ADMINISTRATIVO", ultimoContatoEm: "2026-08-25T12:00:00Z" }),
      lead({ id: "morno-parado", classificacao: "MORNO_ADMINISTRATIVO", ultimoContatoEm: "2026-08-15T12:00:00Z" }),
      lead({ id: "judicial", classificacao: "QUENTE_JUDICIAL", ultimoContatoEm: "2026-08-25T12:00:00Z" }),
    ];
    expect(montarFila(leads, AGORA).normal.map((l) => l.id)).toEqual([
      "judicial", "morno-parado", "morno-novo", "exterior",
    ]);
  });

  it("lead sem classificação fica no fim do bloco 3, mas nunca some", () => {
    const leads = [
      lead({ id: "sem" }),
      lead({ id: "exterior", classificacao: "EXTERIOR_VISTO" }),
    ];
    expect(montarFila(leads, AGORA).normal.map((l) => l.id)).toEqual(["exterior", "sem"]);
  });

  it("CURIOSO, DPU e FORA_ESCOPO saem da fila e vão para as filtradas", () => {
    const leads = (["CURIOSO", "DPU", "FORA_ESCOPO"] as const).map((c, i) =>
      lead({ id: c, classificacao: c, createdAt: `2026-08-2${i}T12:00:00Z` }),
    );
    const fila = montarFila([...leads, lead({ id: "fica", classificacao: "MORNO_ADMINISTRATIVO" })], AGORA);
    expect(fila.normal.map((l) => l.id)).toEqual(["fica"]);
    expect(fila.filtradas).toHaveLength(3);
  });

  it("uma filtrada com prazo sinalizado NÃO reaparece na fila por acidente", () => {
    // A aba de filtradas existe para auditoria: quem sai da fila só volta por resgate,
    // que é ato de gente e fica registrado.
    const l = lead({ id: "x", classificacao: "CURIOSO", temPrazoCorrendo: true });
    const fila = montarFila([l], AGORA);
    expect(fila.aConfirmar).toHaveLength(0);
    expect(fila.filtradas.map((i) => i.id)).toEqual(["x"]);
  });
});
