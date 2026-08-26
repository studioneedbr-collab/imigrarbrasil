import { agoraEmBrasilia } from "@/lib/agent/expediente";

// QUANDO E EM QUE RITMO O SISTEMA PODE FALAR PRIMEIRO.
//
// Vale só para mensagem que o SISTEMA INICIA (follow-up automático). Resposta a quem
// escreveu continua saindo na hora, de madrugada, no domingo — quem puxou a conversa foi
// a pessoa, e deixá-la esperando 10h seria pior atendimento e não protege nada.
//
// Dois riscos diferentes, duas travas:
//  · HORÁRIO — follow-up às 3h da manhã é o tipo de coisa que faz a pessoa bloquear e
//    denunciar de manhã. A janela é mais larga que o expediente (8h–18h) porque aqui não
//    depende de ter gente no escritório, só de ser hora civilizada.
//  · RAJADA — o cron mandava todos os follow-ups vencidos em sequência, sem intervalo.
//    Com 60 conversas paradas, são 60 mensagens saindo do mesmo número em segundos:
//    assinatura clássica de disparo em massa. Agora sai uma a cada poucos segundos, com
//    intervalo variável, e o resto espera a próxima rodada.
export const JANELA_ENVIO = {
  /** Hora (Brasília) em que o disparo automático abre. */
  inicio: 8,
  /** Hora em que fecha — às 20h em ponto já não sai nada. */
  fim: 20,
  intervaloMinMs: 4_000,
  intervaloMaxMs: 9_000,
} as const;

/**
 * Teto de mensagens automáticas por rodada do cron. Na prática quem costuma encerrar a
 * rodada é o ORÇAMENTO de tempo (o espaçamento consome o relógio antes) — o teto é só
 * para o caso de os envios voltarem instantâneos.
 */
export const MAX_POR_RODADA = 12;

/**
 * Tempo total que uma rodada pode gastar. Fica abaixo do `maxDuration = 60` das rotas de
 * cron: estourar o limite mataria a função no meio de um envio, deixando a mensagem
 * enviada e o follow-up ainda marcado como pendente (reenvio na rodada seguinte).
 */
export const ORCAMENTO_MS = 45_000;

/** Dia útil, dentro da janela civilizada, no relógio de Brasília (não no do servidor). */
export function podeDispararAgora(now: Date): boolean {
  const { diaSemana, hora } = agoraEmBrasilia(now);
  const diaUtil = diaSemana >= 1 && diaSemana <= 5;
  return diaUtil && hora >= JANELA_ENVIO.inicio && hora < JANELA_ENVIO.fim;
}

/** Intervalo variável entre dois envios. Cadência fixa é padrão de robô — e é detectável. */
export function intervaloEntreEnvios(): number {
  const { intervaloMinMs: min, intervaloMaxMs: max } = JANELA_ENVIO;
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Controla uma rodada de disparos: conta os envios, respeita o teto e o orçamento de
 * tempo, e espaça um envio do outro. O primeiro sai na hora — o intervalo é ENTRE eles.
 */
export function novaRodada(inicio: number = Date.now()) {
  let enviados = 0;
  return {
    get enviados() {
      return enviados;
    },
    /** Ainda dá para mandar mais uma nesta rodada? */
    podeMais(): boolean {
      return enviados < MAX_POR_RODADA && Date.now() - inicio < ORCAMENTO_MS;
    },
    /** Espera antes do PRÓXIMO envio e registra o que acabou de sair. */
    async registrarEnvio(): Promise<void> {
      enviados++;
      await new Promise((r) => setTimeout(r, intervaloEntreEnvios()));
    },
  };
}
