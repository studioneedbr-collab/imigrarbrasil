import { describe, it, expect } from "vitest";
import { montarMeus, diasParado } from "@/lib/operacao/meus";
import { dentroDoExpediente, slaHorasDe } from "@/lib/operacao/limites";
import { itensDeAlarme, type SaudeDaOperacao } from "@/lib/operacao/saude";
import { conversasSemResposta } from "@/lib/operacao/sem-resposta";
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


// ─────────────────────────────────────────────────────────────────────────────
// O PAINEL "OPERAÇÃO" DA BARRA LATERAL
// ─────────────────────────────────────────────────────────────────────────────

const saude = (patch: Partial<SaudeDaOperacao> = {}): SaudeDaOperacao => ({
  captacaoParada: false,
  motivo: null,
  whatsapp: { configurado: true, conectado: true, detalhe: "WhatsApp conectado." },
  ia: { configurado: true, funcionando: true, saldo: "4.76 USD", detalhe: "A Ana está pensando." },
  ultimaMensagem: { em: "2026-08-26T14:50:00Z", haMinutos: 14 },
  silencioNoExpediente: false,
  falhas24h: { transcricao: 0, llm: 0 },
  semResposta: 0,
  lembretesVencidos: 0,
  followupsPendentes: 0,
  conferidoEm: AGORA.toISOString(),
  ...patch,
});

describe("o painel de operação só mostra alarme", () => {
  it("operação saudável não lista item nenhum — nem zerado", () => {
    // Uma coluna de linhas verdes e zeros vira mobília em três dias, e mobília é a
    // única coisa que o olho não vê. Lista vazia é o que faz a barra lateral desenhar
    // a linha única de "tudo certo".
    expect(itensDeAlarme(saude())).toEqual([]);
  });

  it("custo não aparece em lugar nenhum da operação", () => {
    // O saldo continua no objeto (a tela de Integrações o lê), mas dinheiro não entra
    // no painel de saúde: ninguém deve estar olhando gasto enquanto a captação parou.
    const itens = itensDeAlarme(saude({ falhas24h: { transcricao: 2, llm: 3 }, semResposta: 1 }));
    const texto = JSON.stringify(itens);
    expect(texto).not.toMatch(/USD|R\$|saldo|custo/i);
  });

  it("a falha de LLM tem contador próprio, e ele linka para a tela de falha de LLM", () => {
    // O contador apontava para /dashboard/audios?tipo=deepseek_falhou: queda do modelo
    // levando para a tela de áudio. Quem clicava não encontrava nada com a sua cara.
    const itens = itensDeAlarme(saude({ falhas24h: { transcricao: 4, llm: 7 } }));
    const llm = itens.find((i) => i.chave === "llm");
    const transcricao = itens.find((i) => i.chave === "transcricao");
    expect(llm?.href).toBe("/dashboard/falhas-llm");
    expect(llm?.valor).toBe("7");
    expect(transcricao?.href).toBe("/dashboard/audios");
    expect(transcricao?.valor).toBe("4");
  });

  it("o WhatsApp desconectado aparece como indicador compacto, sem repetir a faixa", () => {
    const itens = itensDeAlarme(
      saude({
        whatsapp: { configurado: true, conectado: false, detalhe: "O WhatsApp está desconectado. Nenhuma mensagem está entrando." },
        captacaoParada: true,
      }),
    );
    const wpp = itens.find((i) => i.chave === "whatsapp");
    expect(wpp?.valor).toBe("desconectado");
    // A frase inteira é da faixa vermelha, que é mais visível e tem o botão de reconectar.
    expect(wpp?.valor).not.toContain("Nenhuma mensagem");
  });

  it("o vocabulário é conectado/desconectado — nunca 'fora do ar'", () => {
    const desconectado = itensDeAlarme(
      saude({ whatsapp: { configurado: true, conectado: false, detalhe: "" } }),
    );
    expect(desconectado[0].valor).toBe("desconectado");
    const semConfig = itensDeAlarme(
      saude({ whatsapp: { configurado: false, conectado: false, detalhe: "" } }),
    );
    expect(semConfig[0].valor).toBe("não configurado");
    expect(JSON.stringify(desconectado.concat(semConfig))).not.toMatch(/fora do ar|queda/i);
  });

  it("'última mensagem há 14 min' não aparece sozinha — só passando do limite no expediente", () => {
    // 14 minutos é normal às 3h e é alarme às 14h de uma terça. Sem essa referência o
    // número obriga quem lê a fazer a conta de cabeça, toda vez.
    expect(itensDeAlarme(saude({ ultimaMensagem: { em: "x", haMinutos: 14 } }))).toEqual([]);
    const alarmando = itensDeAlarme(
      saude({ silencioNoExpediente: true, ultimaMensagem: { em: "x", haMinutos: 240 } }),
    );
    expect(alarmando.find((i) => i.chave === "silencio")?.valor).toBe("há 4h");
  });

  it("mensagem parada sem resposta vira item; zero não vira", () => {
    expect(itensDeAlarme(saude({ semResposta: 3 })).find((i) => i.chave === "sem_resposta")?.valor).toBe("3");
    expect(itensDeAlarme(saude({ semResposta: 0 })).find((i) => i.chave === "sem_resposta")).toBeUndefined();
  });
});

describe("mensagem que entrou e não teve resposta", () => {
  const agora = new Date("2026-08-26T15:00:00Z");
  const msg = (conversationId: string, role: "user" | "assistant", createdAt: string) =>
    ({ conversationId, role, createdAt });

  it("conta a conversa cuja última mensagem é do contato e passou do limite", () => {
    const paradas = conversasSemResposta(
      [msg("c1", "user", "2026-08-26T14:40:00Z")],
      { minutos: 10, agora },
    );
    expect(paradas.map((p) => p.conversationId)).toEqual(["c1"]);
    expect(paradas[0].minutos).toBe(20);
  });

  it("não conta quando nós respondemos depois", () => {
    const paradas = conversasSemResposta(
      [msg("c1", "user", "2026-08-26T14:40:00Z"), msg("c1", "assistant", "2026-08-26T14:41:00Z")],
      { minutos: 10, agora },
    );
    expect(paradas).toEqual([]);
  });

  it("não conta a que acabou de chegar", () => {
    expect(
      conversasSemResposta([msg("c1", "user", "2026-08-26T14:57:00Z")], { minutos: 10, agora }),
    ).toEqual([]);
  });

  it("conversa assumida por uma pessoa fica de fora — ali o silêncio da Ana é o certo", () => {
    const paradas = conversasSemResposta([msg("c1", "user", "2026-08-26T10:00:00Z")], {
      minutos: 10,
      agora,
      ignorar: new Set(["c1"]),
    });
    expect(paradas).toEqual([]);
  });

  it("quem espera há mais tempo vem primeiro", () => {
    const paradas = conversasSemResposta(
      [msg("nova", "user", "2026-08-26T14:30:00Z"), msg("antiga", "user", "2026-08-26T09:00:00Z")],
      { minutos: 10, agora },
    );
    expect(paradas.map((p) => p.conversationId)).toEqual(["antiga", "nova"]);
  });
});
