// OS LIMITES DA OPERAÇÃO.
//
// Todo número aqui é um julgamento, não uma constante técnica. Ficam num arquivo só,
// com o motivo escrito ao lado, porque a pergunta "por que 3 horas e não 6?" vai
// aparecer — e a resposta não pode ser "estava assim".
//
// Todos são conservadores de propósito: é melhor o painel incomodar uma vez à toa do
// que deixar passar um dia inteiro de captação parada.

import { EXPEDIENTE as JANELA, agoraEmBrasilia } from "@/lib/agent/expediente";

/**
 * Quanto tempo sem NENHUMA mensagem, dentro do expediente, antes de tratar como
 * operação parada.
 *
 * Três horas porque este atendimento não tem hora morta: das 8h às 20h chega mensagem
 * de gente em fuso diferente, em seis idiomas, o dia inteiro. Três horas de silêncio
 * num dia útil não é um dia fraco — é sinal de que alguma coisa quebrou entre o
 * WhatsApp da pessoa e o painel. Fora do expediente o silêncio é normal e não alarma.
 */
export const HORAS_SEM_MENSAGEM_ALARME = 3;

/**
 * Quantos minutos uma mensagem do contato pode ficar SEM RESPOSTA antes de virar alarme.
 *
 * Dez minutos porque a Ana responde em segundos: passou de dez, não é demora — é
 * mensagem que entrou e não saiu resposta (exceção no meio do webhook, envio recusado
 * pela Z-API, agente que devolveu vazio). O limite é curto de propósito, porque o que
 * está sendo medido não é lentidão, é ausência.
 *
 * Conversas com atendimento humano assumido ficam de fora da conta — ver
 * `lib/operacao/sem-resposta.ts`. Lá o silêncio da Ana é o comportamento certo.
 */
export const MINUTOS_SEM_RESPOSTA_ALARME = 10;

/**
 * A JANELA DO EXPEDIENTE VEM DE UM LUGAR SÓ.
 *
 * Eu tinha escrito 8h–20h aqui enquanto o agente usa 8h–18h (lib/agent/expediente.ts) —
 * duas definições de "horário de atendimento" no mesmo produto, que iam divergir no
 * primeiro ajuste. Pior: o alarme de silêncio dispararia entre 18h e 20h todo dia, numa
 * faixa em que a Ana já está dizendo à pessoa que o time só volta amanhã.
 *
 * A fonte da verdade é a do agente: é a janela em que existe gente no escritório.
 */
export { EXPEDIENTE } from "@/lib/agent/expediente";

/**
 * A partir de quantos dias sem movimento um atendimento conta como PARADO.
 *
 * Sete dias, e não três: o ciclo aqui é longo por natureza — a pessoa some duas semanas
 * esperando documento do consulado, e isso é o processo funcionando. Alarmar em três
 * dias treinaria o time a ignorar o alarme, que é o pior resultado possível.
 */
export const DIAS_PARA_CONSIDERAR_PARADO = 7;

/**
 * SLA DE PRIMEIRO CONTATO HUMANO, em horas, por classificação.
 *
 * O caso com prazo tem limite curto porque o custo do atraso não é um lead frio: é um
 * prazo perdido. Quatro horas cobre "chegou de manhã, alguém liga antes do almoço".
 * O resto tem um dia útil, que é o que uma assessoria consegue sustentar sem prometer
 * o que não cumpre.
 */
export const SLA_HORAS: Record<string, number> = {
  QUENTE_PRAZO: 4,
  QUENTE_JUDICIAL: 8,
  MORNO_ADMINISTRATIVO: 24,
  EXTERIOR_VISTO: 24,
};
export const SLA_HORAS_PADRAO = 24;

export function slaHorasDe(classificacao: string | null | undefined): number {
  return (classificacao && SLA_HORAS[classificacao]) || SLA_HORAS_PADRAO;
}

/** Está dentro do expediente em Brasília? Mesma janela e mesma conta que o agente faz. */
export function dentroDoExpediente(agora: Date = new Date()): boolean {
  const { diaSemana, hora } = agoraEmBrasilia(agora);
  const diaUtil = diaSemana >= 1 && diaSemana <= 5;
  return diaUtil && hora >= JANELA.inicio && hora < JANELA.fim;
}
