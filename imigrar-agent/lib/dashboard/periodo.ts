/**
 * PERÍODO E ATIVIDADE DO PAINEL.
 *
 * Em 17/08/2026 o painel mostrava "Conversas hoje: 0" num dia em que a Shayene tinha
 * trocado 45 mensagens e atendido quatro clientes. Nada estava travado — o painel media a
 * coisa errada, de duas formas:
 *
 * 1. Contava conversa por data de CRIAÇÃO e chamava isso de "volume de atendimento". As
 *    quatro conversas daquele dia eram de clientes que voltaram (criadas em 07, 10, 15 e
 *    16 de agosto), então o dia zerava. Com follow-up de 24h e reinício de conversa,
 *    cliente que volta é a regra da operação, não a exceção — medir só o que nasceu no dia
 *    esconde justamente o trabalho do agente.
 *
 * 2. Tirava o "hoje" do relógio do servidor. Na Vercel o processo roda em UTC, e meia-noite
 *    UTC são 21h no Rio: das 21h à meia-noite o painel já contava o dia seguinte. É a mesma
 *    armadilha que lib/agent/index.ts documenta e resolve para a saudação da Shayene ("às
 *    22h de sexta no Rio o getDay() já dizia sábado").
 *
 * Por isso as duas coisas moram aqui, juntas e testadas: qualquer indicador de "atendimento"
 * no painel usa ATIVIDADE, e qualquer recorte de tempo usa o DIA DE CALENDÁRIO DE BRASÍLIA.
 */

const FUSO = "America/Sao_Paulo";

/**
 * Deslocamento real do fuso naquele instante, lido da base de fusos (não fixado em -03:00).
 * O Brasil abandonou o horário de verão em 2019, mas se ele voltar isto continua correto.
 */
function offsetDeBrasilia(instante: Date): string {
  const nome = new Intl.DateTimeFormat("en-US", { timeZone: FUSO, timeZoneName: "longOffset" })
    .formatToParts(instante)
    .find((p) => p.type === "timeZoneName")?.value;
  const offset = nome?.replace("GMT", "").trim();
  return offset && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : "-03:00";
}

/** Dia do calendário em Brasília, como "2026-08-17". */
export function diaEmBrasilia(instante: Date | string): string {
  const d = typeof instante === "string" ? new Date(instante) : instante;
  // en-CA formata como YYYY-MM-DD, que ordena alfabeticamente igual a cronologicamente.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Instante em que começou (00:00 de Brasília) o dia a que este instante pertence. */
export function inicioDoDiaEmBrasilia(agora: Date): Date {
  const dia = diaEmBrasilia(agora);
  return new Date(`${dia}T00:00:00.000${offsetDeBrasilia(agora)}`);
}

/**
 * Início da janela de `dias` dias de calendário que TERMINA hoje. Um dia = de 00:00 de hoje
 * até agora; sete dias = de 00:00 de seis dias atrás até agora.
 *
 * Antes o filtro "Hoje" era uma janela rolante de 24h a partir do instante da carga, o que
 * significava outra coisa em cada aba do painel: uma conversa de ontem às 14h desaparecia
 * às 14h01 de hoje, e "hoje" nunca batia com o gráfico, que já agrupava por calendário.
 */
export function inicioDaJanela(agora: Date, dias: number): Date {
  const inicioHoje = inicioDoDiaEmBrasilia(agora);
  if (dias <= 1) return inicioHoje;
  // Volta N-1 dias com folga de fuso e reancora na meia-noite local, para a conta não
  // escorregar se algum dia houver mudança de offset no meio da janela.
  const recuado = new Date(inicioHoje.getTime() - (dias - 1) * 86_400_000);
  return new Date(`${diaEmBrasilia(recuado)}T00:00:00.000${offsetDeBrasilia(recuado)}`);
}

/**
 * Quando a conversa se movimentou por último. É isto que significa "atendimento": cliente
 * que voltou hoje numa conversa de semana passada foi atendido HOJE.
 */
export function atividadeDaConversa(c: { createdAt: string; lastMessageAt?: string | null }): string {
  return c.lastMessageAt ?? c.createdAt;
}

/** Quando o lead andou por último (mudou de etapa, ganhou dado, subiu de score). */
export function movimentacaoDoLead(l: { createdAt: string; updatedAt?: string | null }): string {
  return l.updatedAt ?? l.createdAt;
}

/** Está dentro da janela de `dias` que termina hoje? */
export function dentroDaJanela(iso: string, dias: number, agora: Date = new Date()): boolean {
  return new Date(iso).getTime() >= inicioDaJanela(agora, dias).getTime();
}

/**
 * Um balde por dia de calendário de Brasília, do mais antigo (índice 0) até hoje (último).
 * `peso` soma valor em vez de contar item — é como o pipeline em reais entra no gráfico.
 */
export function bucketsPorDia(
  items: { quando: string; peso?: number }[],
  dias: number,
  agora: Date = new Date(),
): number[] {
  const buckets = new Array(Math.max(1, dias)).fill(0);
  // Chave de dia por índice: comparar strings de data evita aritmética de fuso no meio.
  const inicio = inicioDaJanela(agora, dias);
  const chaves = buckets.map((_, i) => diaEmBrasilia(new Date(inicio.getTime() + i * 86_400_000)));
  const indice = new Map(chaves.map((chave, i) => [chave, i]));
  for (const item of items) {
    const i = indice.get(diaEmBrasilia(item.quando));
    if (i !== undefined) buckets[i] += item.peso ?? 1;
  }
  return buckets;
}
