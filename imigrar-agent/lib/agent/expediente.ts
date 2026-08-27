// QUANDO O TIME VOLTA. Domingo não tem advogado no escritório — e dizer "já chamei uma
// pessoa aqui" às 21h de sábado é prometer um retorno que não vai acontecer. Aqui o
// horário de expediente vira uma frase pronta ("na segunda-feira a partir das 8h") que
// tanto o prompt quanto as mensagens automáticas usam, em vez de cada uma inventar a sua.
//
// O relógio é SEMPRE o de Brasília, lido pelo Intl: `new Date().getDay()` usa o fuso do
// servidor, e na Vercel isso é UTC — às 22h de sexta no Rio o servidor já acha que é
// sábado, e a Ana mandaria a pessoa esperar até segunda por engano. Aqui isso pesa: boa
// parte de quem escreve está em outro fuso e já escreve de madrugada.

export const EXPEDIENTE = { inicio: 8, fim: 18 } as const;

const DIAS = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira",
  "quinta-feira", "sexta-feira", "sábado",
] as const;

/** Dia da semana (0=domingo) e hora, no fuso de Brasília — não no do servidor. */
export function agoraEmBrasilia(now: Date): { diaSemana: number; hora: number; minuto: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const mapa: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    diaSemana: mapa[get("weekday")] ?? 1,
    hora: Number(get("hour")),
    minuto: Number(get("minute")),
  };
}

export interface JanelaAtendimento {
  /** Estamos DENTRO do horário comercial (Seg–Sex, 08h–18h)? */
  dentroDoExpediente: boolean;
  /**
   * Quando uma pessoa do time realmente atende, em linguagem de WhatsApp:
   * "agora", "hoje a partir das 8h", "amanhã a partir das 8h",
   * "na segunda-feira a partir das 8h".
   */
  quando: string;
}

/**
 * A próxima janela em que existe gente no escritório. Fora do expediente, é isto que a
 * Ana promete — nunca "em instantes" nem "em até 30 minutos".
 */
export function proximoAtendimento(now: Date): JanelaAtendimento {
  const { diaSemana, hora } = agoraEmBrasilia(now);
  const diaUtil = diaSemana >= 1 && diaSemana <= 5;

  if (diaUtil && hora >= EXPEDIENTE.inicio && hora < EXPEDIENTE.fim) {
    return { dentroDoExpediente: true, quando: "agora" };
  }

  // Dia útil, antes de abrir: o time chega hoje mesmo.
  if (diaUtil && hora < EXPEDIENTE.inicio) {
    return { dentroDoExpediente: false, quando: `hoje a partir das ${EXPEDIENTE.inicio}h` };
  }

  // Depois das 18h de um dia útil, ou fim de semana: procura o próximo dia útil.
  let dias = 1;
  while (((diaSemana + dias) % 7) === 0 || ((diaSemana + dias) % 7) === 6) dias++;
  const alvo = (diaSemana + dias) % 7;

  // Sempre o NOME do dia, nunca "amanhã": a mensagem fica parada no WhatsApp e a pessoa
  // pode ler no dia seguinte — aí "amanhã" já virou outro dia.
  return {
    dentroDoExpediente: false,
    quando: `na ${DIAS[alvo]} a partir das ${EXPEDIENTE.inicio}h`,
  };
}

/**
 * MINUTOS DE EXPEDIENTE entre dois instantes — o relógio do SLA de primeira resposta.
 *
 * Tempo corrido não serve aqui. Uma mensagem que chega às 17h55 de sexta com SLA de 30
 * minutos estouraria às 18h25 de sexta, quando não tem ninguém no escritório para
 * responder — e na segunda de manhã o painel mostraria um SLA "estourado há 62 horas"
 * que não diz nada sobre a qualidade do atendimento. Contando só expediente, ela vence
 * às 8h30 de segunda: o tempo em que alguém REALMENTE poderia ter respondido.
 *
 * Caminha dia a dia sobre o calendário de Brasília. O laço tem teto de um ano — uma
 * conversa esquecida há mais de um ano não precisa de precisão de minuto.
 */
export function minutosDeExpedienteEntre(de: Date, ate: Date): number {
  const inicio = de.getTime();
  const fim = ate.getTime();
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) return 0;

  const DIA_MS = 86_400_000;
  let total = 0;
  // Anda de dia em dia a partir do início, e para cada dia calcula a interseção entre
  // [de, ate] e a janela de expediente daquele dia.
  for (let d = 0; d <= 366; d++) {
    const instante = new Date(inicio + d * DIA_MS);
    if (instante.getTime() - DIA_MS > fim) break;
    const { diaSemana } = agoraEmBrasilia(instante);
    if (diaSemana === 0 || diaSemana === 6) continue;

    // Meia-noite de Brasília daquele dia, em tempo absoluto: pega a hora/minuto locais
    // do instante e subtrai. Não depende de o servidor estar em Brasília (na Vercel é UTC).
    const { hora, minuto } = agoraEmBrasilia(instante);
    const meiaNoite = instante.getTime() - (hora * 60 + minuto) * 60_000 - (instante.getSeconds() * 1000 + instante.getMilliseconds());
    const abre = meiaNoite + EXPEDIENTE.inicio * 3_600_000;
    const fecha = meiaNoite + EXPEDIENTE.fim * 3_600_000;

    const dentro = Math.min(fim, fecha) - Math.max(inicio, abre);
    if (dentro > 0) total += dentro;
  }
  return Math.floor(total / 60_000);
}

/**
 * O SLA da primeira resposta humana estourou?
 *
 * `desde` é `aguardandoHumanoDesde` da conversa: o instante em que a mensagem chegou com
 * o agente desligado e ninguém respondeu. Enquanto isso estiver preenchido e o SLA
 * estourado, o caso sobe na fila.
 */
export function slaHumanoEstourado(
  desde: string | null | undefined,
  slaMinutos: number,
  agora: Date = new Date(),
): boolean {
  if (!desde) return false;
  const t = Date.parse(desde);
  if (!Number.isFinite(t)) return false;
  return minutosDeExpedienteEntre(new Date(t), agora) >= slaMinutos;
}
