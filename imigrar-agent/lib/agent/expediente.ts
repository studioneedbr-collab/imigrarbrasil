// QUANDO O TIME VOLTA. Domingo não tem ninguém no comercial — e dizer "já chamei uma
// pessoa aqui" às 21h de sábado é prometer um retorno que não vai acontecer. Aqui o
// horário de expediente vira uma frase pronta ("na segunda-feira a partir das 8h") que
// tanto o prompt quanto as mensagens automáticas usam, em vez de cada uma inventar a sua.
//
// O relógio é SEMPRE o de Brasília, lido pelo Intl: `new Date().getDay()` usa o fuso do
// servidor, e na Vercel isso é UTC — às 22h de sexta no Rio o servidor já acha que é
// sábado, e a Shayene mandaria o cliente esperar até segunda por engano.

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
 * Shayene promete — nunca "em instantes" nem "em até 30 minutos".
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
