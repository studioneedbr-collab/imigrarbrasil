import { describe, it, expect } from "vitest";
import { montarMeus, diasParado } from "@/lib/operacao/meus";
import { dentroDoExpediente, slaHorasDe } from "@/lib/operacao/limites";
import type { LeadDaFila } from "@/lib/fila/ordenacao";
import type { Lembrete } from "@/lib/domain/types";

const AGORA = new Date("2026-08-26T15:00:00Z"); // quarta, 12h em Brasília

const lead = (patch: Partial<LeadDaFila> = {}): LeadDaFila =>
  ({
    id: "l1", conversationId: "c1", whatsappNumber: "5521999999999",
    status: "new", stage: "novo", score: 0,
    createdAt: "2026-08-20T12:00:00Z", updatedAt: "2026-08-20T12:00:00Z",
    atendimentoStatus: "em_atendimento", temPrazoCorrendo: false,
    responsavelId: "eu",
    ...patch,
  }) as LeadDaFila;

describe("quem está com a bola", () => {
  it("separa 'esperando eu' de 'esperando o cliente' por quem falou por último", () => {
    // É a informação mais útil da tela: um caso é dívida nossa, o outro é paciência.
    const balde = montarMeus(
      [
        lead({ id: "pessoa-falou", ultimaMensagemDe: "user" }),
        lead({ id: "nos-respondemos", ultimaMensagemDe: "assistant" }),
      ],
      [], "eu", AGORA,
    );
    expect(balde.comigo.map((l) => l.id)).toEqual(["pessoa-falou"]);
    expect(balde.aguardandoCliente.map((l) => l.id)).toEqual(["nos-respondemos"]);
  });

  it("na minha fila, quem espera há mais tempo vem primeiro", () => {
    const balde = montarMeus(
      [
        lead({ id: "novo", ultimaMensagemDe: "user", ultimoContatoEm: "2026-08-26T10:00:00Z" }),
        lead({ id: "antigo", ultimaMensagemDe: "user", ultimoContatoEm: "2026-08-22T10:00:00Z" }),
      ],
      [], "eu", AGORA,
    );
    expect(balde.comigo.map((l) => l.id)).toEqual(["antigo", "novo"]);
  });

  it("não mostra o que é de outra pessoa", () => {
    const balde = montarMeus([lead({ id: "do-colega", responsavelId: "outro" })], [], "eu", AGORA);
    expect(balde.comigo.concat(balde.aguardandoCliente)).toHaveLength(0);
  });

  it("fechado e perdido saem de tudo — não são trabalho pendente de ninguém", () => {
    const balde = montarMeus(
      [
        lead({ id: "f", atendimentoStatus: "fechado", ultimaMensagemDe: "user" }),
        lead({ id: "p", atendimentoStatus: "perdido", ultimaMensagemDe: "user" }),
      ],
      [], "eu", AGORA,
    );
    expect(balde.comigo).toHaveLength(0);
    expect(balde.parados).toHaveLength(0);
  });

  it("agendado sai dos baldes de espera e vira o seu próprio", () => {
    const balde = montarMeus(
      [lead({ id: "a", atendimentoStatus: "agendado", ultimaMensagemDe: "user" })],
      [], "eu", AGORA,
    );
    expect(balde.comigo).toHaveLength(0);
    expect(balde.agendados.map((l) => l.id)).toEqual(["a"]);
  });

  it("parado atravessa os outros baldes em vez de substituí-los", () => {
    // Um caso pode estar 'aguardando o cliente' E parado há 20 dias. Os dois são verdade,
    // e é a segunda que precisa de decisão.
    const antigo = lead({ id: "x", ultimaMensagemDe: "assistant", ultimoContatoEm: "2026-08-01T10:00:00Z" });
    const balde = montarMeus([antigo], [], "eu", AGORA);
    expect(balde.aguardandoCliente.map((l) => l.id)).toEqual(["x"]);
    expect(balde.parados.map((l) => l.id)).toEqual(["x"]);
    expect(diasParado(antigo, AGORA)).toBe(25);
  });

  it("lembrete de hoje e atrasado sobe; o de amanhã não", () => {
    const lembretes: Lembrete[] = [
      { id: "1", leadId: "l1", quando: "2026-08-26", nota: "ligar hoje", autor: "eu", criadoEm: "" },
      { id: "2", leadId: "l1", quando: "2026-08-20", nota: "atrasado", autor: "eu", criadoEm: "" },
      { id: "3", leadId: "l1", quando: "2026-09-30", nota: "depois", autor: "eu", criadoEm: "" },
      { id: "4", leadId: "l1", quando: "2026-08-01", nota: "já feito", autor: "eu", criadoEm: "", feitoEm: "2026-08-02" },
    ];
    const balde = montarMeus([lead()], lembretes, "eu", AGORA);
    expect(balde.paraHoje.map((p) => p.lembrete.id)).toEqual(["2", "1"]);
  });
});

describe("limites da operação", () => {
  it("o SLA do caso com prazo é mais curto que o dos demais", () => {
    expect(slaHorasDe("QUENTE_PRAZO")).toBeLessThan(slaHorasDe("MORNO_ADMINISTRATIVO"));
    expect(slaHorasDe(null)).toBe(24);
  });

  it("o silêncio só alarma dentro do expediente", () => {
    expect(dentroDoExpediente(new Date("2026-08-26T15:00:00Z"))).toBe(true);  // quarta, 12h
    expect(dentroDoExpediente(new Date("2026-08-26T05:00:00Z"))).toBe(false); // quarta, 2h
    expect(dentroDoExpediente(new Date("2026-08-29T15:00:00Z"))).toBe(false); // sábado
  });
});
