// OS RÓTULOS DA INTERFACE.
//
// Ficam no domínio, longe do repositório, porque o painel os importa em componentes de
// cliente. E ficam num lugar só porque a mesma classificação aparece na fila, no
// detalhe, na aba de filtradas e nas métricas — quatro grafias diferentes da mesma
// coisa é como um time deixa de confiar no painel.

import type { AtendimentoStatus, Classificacao, Intencao, PrazoTipo } from "@/lib/domain/types";

export const CLASSIFICACAO_LABEL: Record<Classificacao, string> = {
  QUENTE_PRAZO: "Prazo correndo",
  QUENTE_JUDICIAL: "Judicial",
  MORNO_ADMINISTRATIVO: "Administrativo",
  EXTERIOR_VISTO: "No exterior",
  DPU: "Defensoria (DPU)",
  CURIOSO: "Sem caso concreto",
  FORA_ESCOPO: "Fora do escopo",
};

/** O que cada uma quer dizer, para quem está reclassificando e precisa acertar. */
export const CLASSIFICACAO_AJUDA: Record<Classificacao, string> = {
  QUENTE_PRAZO: "Multa, indeferimento, notificação de saída — há prazo processual correndo.",
  QUENTE_JUDICIAL: "O caso exige ação judicial: processo, decisão a recorrer, pessoa detida.",
  MORNO_ADMINISTRATIVO: "Caso viável, sem urgência.",
  EXTERIOR_VISTO: "Pessoa fora do Brasil, tratando de visto.",
  DPU: "Perfil de gratuidade — encaminhado à Defensoria Pública da União.",
  CURIOSO: "Perguntou por curiosidade, sem caso concreto.",
  FORA_ESCOPO: "Outro país de destino, ou outra área do direito.",
};

export const ATENDIMENTO_LABEL: Record<AtendimentoStatus, string> = {
  novo: "Novo",
  em_atendimento: "Em atendimento",
  agendado: "Reunião agendada",
  fechado: "Fechado",
  perdido: "Perdido",
};

export const PRAZO_TIPO_LABEL: Record<PrazoTipo, string> = {
  multa: "Multa migratória",
  indeferimento: "Indeferimento",
  notificacao_saida: "Notificação de saída",
  outro: "Outro prazo",
};

export const INTENCAO_LABEL: Record<Intencao, string> = {
  contratar: "Quer que o escritório cuide",
  sozinho: "Prefere tocar sozinho",
  sem_condicoes: "Sem condições de pagar",
};

/** O que fazer com cada resposta — quem lê a ficha decide em cima disto. */
export const INTENCAO_AJUDA: Record<Intencao, string> = {
  contratar: "Declarou que quer o escritório conduzindo. É este que vai para a fila.",
  sozinho: "Quer orientação pontual, não condução. Não ocupe a agenda do time com ele.",
  sem_condicoes: "Encaminhado à Defensoria Pública da União.",
};

/** "há 3 dias", "há 2 h", "agora". Tempo desde o último contato, curto o bastante para caber na linha. */
export function desde(iso: string | null | undefined, agora: Date = new Date()): string {
  if (!iso) return "—";
  const ms = agora.getTime() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "agora";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} ${d === 1 ? "dia" : "dias"}`;
  const m = Math.floor(d / 30);
  return `há ${m} ${m === 1 ? "mês" : "meses"}`;
}
