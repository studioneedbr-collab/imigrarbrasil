// QUANDO O SISTEMA PODE FALAR PRIMEIRO — a decisão inteira, pura e testável.
//
// Este arquivo não manda mensagem, não lê banco e não sabe o que é a Z-API. Ele responde
// uma pergunta e só ela: dado o estado deste caso e o relógio, o que acontece agora?
//
// Vive isolado porque é a regra mais cara de errar do sistema. Um escritório opera com UM
// número; se ele for bloqueado, a captação inteira para, e isso é mais grave do que
// qualquer lead perdido. Todas as travas contra isso passam por aqui, numa ordem que não
// é arbitrária:
//
//   1. O QUE NUNCA PODE  — opt-out, DPU, ensaio, quem nunca respondeu. São proibições, e
//      proibição não espera janela nem entra em fila: ela mata o disparo.
//   2. O QUE NÃO É MENSAGEM — prazo processual correndo. Isso se resolve com LIGAÇÃO, e
//      o sistema gera tarefa em vez de mandar texto programado.
//   3. O QUE ACABOU — a sequência esgotada. Vira desfecho, não vira mensagem.
//   4. O QUE AINDA NÃO — data futura, fora da janela, teto diário, intervalo mínimo.
//      Estes ADIAM, nunca cancelam: o toque continua devendo e sai na próxima passagem.
//   5. O QUE FALTA — sem modelo no idioma da pessoa. Vira tarefa para alguém escrever.
//
// A ordem importa porque as respostas são diferentes: "bloqueado" some da fila para
// sempre, "adiado" volta amanhã, "tarefa" aparece para um humano fazer.

import { agoraEmBrasilia } from "@/lib/agent/expediente";
import { MAX_TOQUES, type MotivoEspera } from "@/lib/followup/motivos";

/**
 * O intervalo mínimo entre dois toques ao MESMO contato, em horas.
 *
 * Vinte horas e não vinte e quatro: a cadência de dois dias ("aguardando decisão sobre a
 * proposta") tem de conseguir sair no dia certo, e um cron que roda de manhã depois de um
 * toque que saiu ao meio-dia ficaria travado para sempre por causa de duas horas.
 */
export const INTERVALO_MINIMO_HORAS = 20;

/**
 * A JANELA CIVILIZADA, no relógio de quem RECEBE.
 *
 * "No fuso da pessoa" é o que a regra pede e é mais do que o sistema honestamente sabe:
 * o que existe no cadastro é o país, não o fuso, e um DDI não identifica fuso (os Estados
 * Unidos têm seis). Então há duas janelas, e a diferença é deliberada:
 *
 *   NO BRASIL   8h–20h de Brasília, que é o fuso da pessoa de verdade.
 *   NO EXTERIOR 12h–18h de Brasília. É a faixa que continua sendo horário decente em
 *               quase toda a extensão onde este público está — das Américas à Europa e à
 *               África Ocidental. Mais estreita porque a incerteza é maior, e o erro que
 *               ela evita (mensagem às 4h da manhã de alguém) custa uma denúncia.
 */
export const JANELA_BRASIL = { inicio: 8, fim: 20 } as const;
export const JANELA_EXTERIOR = { inicio: 12, fim: 18 } as const;

export type MotivoDeBloqueio =
  | "opt_out"
  | "sem_followup"
  | "nunca_respondeu"
  | "sem_motivo_de_espera"
  | "ensaio"
  | "encerrado";

export type MotivoDeAdiamento =
  | "ainda_nao_venceu"
  | "fora_da_janela"
  | "fim_de_semana"
  | "intervalo_minimo"
  | "teto_diario";

export type Decisao =
  /** Nunca mais, ou não é caso de follow-up. Some da fila. */
  | { tipo: "bloqueado"; porque: MotivoDeBloqueio }
  /** Continua devendo. Volta na próxima passagem do cron. */
  | { tipo: "adiar"; porque: MotivoDeAdiamento }
  /** Prazo processual: gera tarefa de LIGAR, nunca mensagem programada. */
  | { tipo: "tarefa_ligar" }
  /** Não existe modelo no idioma da pessoa: alguém escreve à mão. */
  | { tipo: "tarefa_manual" }
  /** Terceiro toque sem resposta: vira PERDIDO com motivo "sumiu", com uma despedida. */
  | { tipo: "encerrar_sumiu" }
  /** Pode sair. `envio` diz se vai como rascunho para aprovação ou direto. */
  | { tipo: "disparar"; envio: "rascunho" | "automatico" };

export interface CasoEmEspera {
  /** O motivo escolhido por quem pausou. Sem ele não há follow-up — há pendência. */
  motivo: MotivoEspera | null;
  /** Quando o próximo toque vence (ISO). Nulo = ninguém agendou. */
  proximoToqueEm?: string | null;
  /** Quantos toques já saíram NESTE motivo. Zera quando a pessoa responde. */
  toquesNoMotivo: number;
  /** Quando saiu o último toque para este contato (ISO), de qualquer motivo. */
  ultimoToqueEm?: string | null;
  /** Pediu para parar. Nunca mais recebe nada automático. */
  optOutAt?: string | null;
  /** Disse que não tem interesse. Conversa segue; automação não vai atrás. */
  noFollowupAt?: string | null;
  /**
   * A pessoa já respondeu ALGUMA mensagem alguma vez? Disparar para quem nunca respondeu
   * é a assinatura mais clara de disparo em massa que existe — e é o padrão que os
   * classificadores do WhatsApp procuram.
   */
  jaRespondeuAlguma: boolean;
  /** Prazo processual correndo. Estes casos NUNCA entram em follow-up automático. */
  temPrazoProcessual: boolean;
  /** Encaminhado à DPU: o escritório não é o caminho dela, e insistir seria pior. */
  perfilDpu?: boolean;
  /** Ensaio (simulador, suíte). Nunca sai mensagem de verdade daqui. */
  ensaio?: boolean;
  /** O caso já teve desfecho — fechado ou perdido. */
  encerrado?: boolean;
  /** Onde a pessoa está. Decide qual janela de horário vale. */
  noExterior?: boolean;
  /** Existe modelo cadastrado no idioma desta pessoa para este motivo? */
  temModeloNoIdioma: boolean;
  /** Como este modelo sai: rascunho para aprovação (padrão) ou envio automático. */
  envioDoModelo?: "rascunho" | "automatico";
}

export interface EstadoDaRodada {
  /** Quantos follow-ups automáticos já saíram hoje nesta instância. */
  enviadosHoje: number;
  /** O teto diário configurado para a instância. */
  tetoDiario: number;
}

/** A janela vale agora, no relógio de Brasília, para quem está aqui ou lá fora? */
export function dentroDaJanela(agora: Date, noExterior = false): boolean {
  const { hora } = agoraEmBrasilia(agora);
  const janela = noExterior ? JANELA_EXTERIOR : JANELA_BRASIL;
  return hora >= janela.inicio && hora < janela.fim;
}

/** Sábado e domingo não. Follow-up de fim de semana lê-se como cobrança. */
export function diaUtil(agora: Date): boolean {
  const { diaSemana } = agoraEmBrasilia(agora);
  return diaSemana >= 1 && diaSemana <= 5;
}

export function decidir(
  caso: CasoEmEspera,
  rodada: EstadoDaRodada,
  agora: Date = new Date(),
): Decisao {
  // ─── 1. O QUE NUNCA PODE ───
  if (caso.ensaio) return { tipo: "bloqueado", porque: "ensaio" };
  if (caso.optOutAt) return { tipo: "bloqueado", porque: "opt_out" };
  // A DPU entra aqui e não numa regra separada: quem foi encaminhado à Defensoria já
  // recebeu o encaminhamento certo, e ir atrás dele é ocupar a pessoa com um serviço que
  // ela não vai contratar.
  if (caso.perfilDpu) return { tipo: "bloqueado", porque: "opt_out" };
  if (caso.noFollowupAt) return { tipo: "bloqueado", porque: "sem_followup" };
  if (caso.encerrado) return { tipo: "bloqueado", porque: "encerrado" };
  if (!caso.jaRespondeuAlguma) return { tipo: "bloqueado", porque: "nunca_respondeu" };
  // Caso parado SEM motivo registrado não vira mensagem: vira pendência na tela de
  // Operação. Mandar follow-up sem saber o que se está esperando é exatamente a mensagem
  // genérica que este sistema existe para não mandar.
  if (!caso.motivo) return { tipo: "bloqueado", porque: "sem_motivo_de_espera" };

  // ─── 2. PRAZO PROCESSUAL NÃO SE RESOLVE POR MENSAGEM ───
  //
  // Em hipótese nenhuma, e antes de qualquer conta de janela ou de teto. Quem tem defesa
  // a protocolar precisa de alguém do escritório no telefone; uma mensagem programada
  // gasta o único contato que a pessoa vai ler naquele dia.
  if (caso.temPrazoProcessual) return { tipo: "tarefa_ligar" };

  // ─── 3. A SEQUÊNCIA TEM FIM ───
  if (caso.toquesNoMotivo >= MAX_TOQUES) return { tipo: "encerrar_sumiu" };

  // ─── 4. O QUE AINDA NÃO ─── (adia, nunca cancela)
  const venceEm = caso.proximoToqueEm ? Date.parse(caso.proximoToqueEm) : NaN;
  if (!Number.isFinite(venceEm) || venceEm > agora.getTime()) {
    return { tipo: "adiar", porque: "ainda_nao_venceu" };
  }
  if (!diaUtil(agora)) return { tipo: "adiar", porque: "fim_de_semana" };
  if (!dentroDaJanela(agora, caso.noExterior)) return { tipo: "adiar", porque: "fora_da_janela" };
  if (caso.ultimoToqueEm) {
    const desde = agora.getTime() - Date.parse(caso.ultimoToqueEm);
    if (Number.isFinite(desde) && desde < INTERVALO_MINIMO_HORAS * 3600 * 1000) {
      return { tipo: "adiar", porque: "intervalo_minimo" };
    }
  }
  if (rodada.enviadosHoje >= rodada.tetoDiario) return { tipo: "adiar", porque: "teto_diario" };

  // ─── 5. O QUE FALTA ───
  //
  // O projeto inteiro existe porque o público é multilíngue. Mandar follow-up em
  // português para um haitiano destrói o produto — e é pior do que não mandar nada,
  // porque comunica que ninguém ali percebeu com quem está falando.
  if (!caso.temModeloNoIdioma) return { tipo: "tarefa_manual" };

  return { tipo: "disparar", envio: caso.envioDoModelo ?? "rascunho" };
}
