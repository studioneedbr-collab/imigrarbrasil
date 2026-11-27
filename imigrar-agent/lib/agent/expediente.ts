// QUANDO O TIME VOLTA. Domingo não tem advogado no escritório — e dizer "já chamei uma
// pessoa aqui" às 21h de sábado é prometer um retorno que não vai acontecer. Aqui o
// horário de expediente vira uma frase pronta ("na segunda-feira a partir das 9h") que
// tanto o prompt quanto as mensagens automáticas usam, em vez de cada uma inventar a sua.
//
// O relógio é SEMPRE o de Brasília, lido pelo Intl: `new Date().getDay()` usa o fuso do
// servidor, e na Vercel isso é UTC — às 22h de sexta no Rio o servidor já acha que é
// sábado, e a Ana mandaria a pessoa esperar até segunda por engano. Aqui isso pesa: boa
// parte de quem escreve está em outro fuso e já escreve de madrugada.

/**
 * O HORÁRIO É O DO PAINEL, e não um palpite do código. A equipe escreveu no briefing:
 * "segunda a sexta, das 9h às 18h, e aos sábados, das 9h às 13h. Aos domingos e feriados,
 * o atendimento é realizado exclusivamente pelo WhatsApp" (isto é: pela agente). O código
 * dizia 8h–18h e ignorava o sábado, e a agente respondeu num sábado às 10h20 "estamos fora
 * do horário, retornam segunda a partir das 8h".
 *
 * `EXPEDIENTE` continua sendo o de dia útil para quem só precisa de um número; a grade por
 * dia da semana é `JANELA_DO_DIA`.
 */
export const EXPEDIENTE = { inicio: 9, fim: 18 } as const;

/** Abre e fecha por dia da semana (0 = domingo). `null` = sem gente no escritório. */
export const JANELA_DO_DIA: readonly ({ inicio: number; fim: number } | null)[] = [
  null,
  { inicio: 9, fim: 18 },
  { inicio: 9, fim: 18 },
  { inicio: 9, fim: 18 },
  { inicio: 9, fim: 18 },
  { inicio: 9, fim: 18 },
  { inicio: 9, fim: 13 },
];

/** O horário escrito por extenso, para o prompt e as mensagens fixas. */
export const HORARIO_POR_EXTENSO =
  "segunda a sexta, das 9h às 18h, e sábado, das 9h às 13h (horário de Brasília)";

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), como [mês 1-12, dia]. */
function pascoa(ano: number): [number, number] {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return [mes, dia];
}

/**
 * FERIADO NACIONAL em Brasília. Os fixos da lei federal (inclusive 20/11, desde 2024) e a
 * Sexta-feira Santa. Carnaval e Corpus Christi são ponto facultativo e ficam de fora: se o
 * escritório fechar nesses dias, entram aqui. Em 02/11 a agente disse "o atendimento
 * funciona normalmente hoje" — num feriado.
 */
export function ehFeriadoNacional(ano: number, mes: number, dia: number): boolean {
  const fixos = ["1-1", "4-21", "5-1", "9-7", "10-12", "11-2", "11-15", "11-20", "12-25"];
  if (fixos.includes(`${mes}-${dia}`)) return true;
  const [pm, pd] = pascoa(ano);
  const sextaSanta = new Date(Date.UTC(ano, pm - 1, pd - 2));
  return sextaSanta.getUTCMonth() + 1 === mes && sextaSanta.getUTCDate() === dia;
}

/** Data (ano, mês, dia) no fuso de Brasília. */
function dataEmBrasilia(now: Date): { ano: number; mes: number; dia: number } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { ano: g("year"), mes: g("month"), dia: g("day") };
}

/** A janela de expediente daquele instante (do dia dele, em Brasília), ou null. */
export function janelaDoDia(now: Date): { inicio: number; fim: number } | null {
  const { diaSemana } = agoraEmBrasilia(now);
  const { ano, mes, dia } = dataEmBrasilia(now);
  if (ehFeriadoNacional(ano, mes, dia)) return null;
  return JANELA_DO_DIA[diaSemana];
}

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
  /** Estamos DENTRO do horário de atendimento humano (ver JANELA_DO_DIA)? */
  dentroDoExpediente: boolean;
  /**
   * Quando uma pessoa do time realmente atende, em linguagem de WhatsApp:
   * "agora", "hoje a partir das 9h", "no sábado a partir das 9h",
   * "na segunda-feira a partir das 9h".
   */
  quando: string;
}

/**
 * A próxima janela em que existe gente no escritório. Fora do expediente, é isto que a
 * Ana promete — nunca "em instantes" nem "em até 30 minutos".
 */
export function proximoAtendimento(now: Date): JanelaAtendimento {
  const { hora } = agoraEmBrasilia(now);
  const hoje = janelaDoDia(now);

  if (hoje && hora >= hoje.inicio && hora < hoje.fim) {
    return { dentroDoExpediente: true, quando: "agora" };
  }

  // Dia com expediente, antes de abrir: o time chega hoje mesmo.
  if (hoje && hora < hoje.inicio) {
    return { dentroDoExpediente: false, quando: `hoje a partir das ${hoje.inicio}h` };
  }

  // Depois de fechar, domingo ou feriado: procura o próximo dia com expediente.
  // Sempre o NOME do dia, nunca "amanhã": a mensagem fica parada no WhatsApp e a pessoa
  // pode ler no dia seguinte — aí "amanhã" já virou outro dia.
  for (let dias = 1; dias <= 14; dias++) {
    const dia = new Date(now.getTime() + dias * 86_400_000);
    const janela = janelaDoDia(dia);
    if (!janela) continue;
    const { diaSemana } = agoraEmBrasilia(dia);
    const artigo = diaSemana === 0 || diaSemana === 6 ? "no" : "na";
    return { dentroDoExpediente: false, quando: `${artigo} ${DIAS[diaSemana]} a partir das ${janela.inicio}h` };
  }
  return { dentroDoExpediente: false, quando: "no próximo dia útil" };
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
    const janela = janelaDoDia(instante);
    if (!janela) continue;

    // Meia-noite de Brasília daquele dia, em tempo absoluto: pega a hora/minuto locais
    // do instante e subtrai. Não depende de o servidor estar em Brasília (na Vercel é UTC).
    const { hora, minuto } = agoraEmBrasilia(instante);
    const meiaNoite = instante.getTime() - (hora * 60 + minuto) * 60_000 - (instante.getSeconds() * 1000 + instante.getMilliseconds());
    const abre = meiaNoite + janela.inicio * 3_600_000;
    const fecha = meiaNoite + janela.fim * 3_600_000;

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
