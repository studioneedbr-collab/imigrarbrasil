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

// ─── O VAZIO TEM QUE SER LEGÍVEL ───
//
// Quase todo card do painel mostrava "??" no idioma e "Nacionalidade —" na nacionalidade,
// e "Nacionalidade —" ainda saía cortado como "Nacionalidade..." por não caber na coluna.
//
// Os dois defeitos são o mesmo defeito: um campo vazio estava sendo desenhado como se
// fosse um valor. "??" parece erro de sistema — quem lê pensa que o dado se perdeu, não
// que a conversa tem duas mensagens e ainda não deu tempo de descobrir. A diferença muda
// o que a pessoa faz em seguida: com "erro" ela vai conferir o sistema, com "ainda não
// identificado" ela abre a conversa e pergunta.

/** O que ocupa o lugar de um campo que a conversa ainda não revelou. */
export const AINDA_NAO = "—";

/** O título (tooltip) que explica o traço, para quem passa o mouse e quer saber. */
export const AINDA_NAO_AJUDA = "Ainda não identificado nesta conversa";

/** Nacionalidade em uma palavra, ou o traço. Nunca a palavra "Nacionalidade". */
export function rotuloNacionalidade(
  lead: { nacionalidade?: string | null; clientType?: string | null },
): { texto: string; conhecida: boolean } {
  const valor = (lead.nacionalidade ?? lead.clientType ?? "").trim();
  return valor ? { texto: valor, conhecida: true } : { texto: AINDA_NAO, conhecida: false };
}

/** O nome do contato, ou o traço. "Contato sem nome" ocupava a linha inteira sem dizer nada. */
export function rotuloContato(
  lead: { contactName?: string | null; whatsappNumber?: string | null },
): { texto: string; conhecido: boolean } {
  const nome = (lead.contactName ?? "").trim();
  if (nome) return { texto: nome, conhecido: true };
  const numero = (lead.whatsappNumber ?? "").trim();
  return numero ? { texto: numero, conhecido: false } : { texto: AINDA_NAO, conhecido: false };
}

// ─── POR QUE ESTE CASO IMPORTA (OU NÃO) ───
//
// A lateral do caso mostrava dez campos e nenhuma frase. Quem abria precisava ler campo
// por campo e montar sozinho a conclusão — e a conclusão é sempre a mesma pergunta: isto
// aqui é urgente, é trabalho normal, ou não é trabalho nosso?
//
// Uma linha, e ela vem da hierarquia que o resto do painel já usa: prazo processual acima
// de tudo, depois o que tira o caso da fila (gratuidade, fora do escopo, sem caso
// concreto), depois o relógio do caso, e por último o que falta para o time jurídico
// conseguir pegar. Não é resumo do caso — o resumo tem o lugar dele. É o motivo.

export type TomDoCaso = "urgente" | "atencao" | "neutro" | "baixo";

export interface PorQueImporta {
  texto: string;
  tom: TomDoCaso;
}

export function porQueImporta(lead: {
  temPrazoCorrendo?: boolean | null;
  prazoDataLimite?: string | null;
  prazoTipo?: PrazoTipo | null;
  classificacao?: Classificacao | null;
  intencao?: Intencao | null;
  relogioDoCaso?: string | null;
  fichaFaltando?: string[];
}): PorQueImporta {
  if (lead.temPrazoCorrendo || lead.prazoDataLimite) {
    const que = lead.prazoTipo ? PRAZO_TIPO_LABEL[lead.prazoTipo].toLowerCase() : "prazo processual";
    return {
      tom: "urgente",
      texto: lead.prazoDataLimite
        ? `Há ${que} com data confirmada — este caso perde valor a cada dia parado.`
        : `Há ${que} sinalizado e a data ainda não foi confirmada. Alguém precisa ligar hoje para descobrir quantos dias sobram.`,
    };
  }
  if (lead.classificacao === "DPU") {
    return {
      tom: "baixo",
      texto: "Perfil de gratuidade: foi encaminhado à Defensoria Pública da União, não ao time.",
    };
  }
  if (lead.classificacao === "FORA_ESCOPO") {
    return { tom: "baixo", texto: "Fora do escopo: outro país de destino ou outra área do direito." };
  }
  if (lead.classificacao === "CURIOSO") {
    return { tom: "baixo", texto: "Perguntou sem caso concreto. Não ocupa a agenda do time." };
  }
  if (lead.intencao === "sozinho") {
    return { tom: "baixo", texto: "Disse que prefere tocar o processo sozinha — quer orientação, não condução." };
  }
  if (lead.intencao === "sem_condicoes") {
    return { tom: "baixo", texto: "Declarou não ter condições de pagar. O caminho aqui é a Defensoria." };
  }
  if (lead.relogioDoCaso?.trim()) {
    return { tom: "atencao", texto: `O que pressiona o caso: ${lead.relogioDoCaso.trim()}` };
  }
  const faltam = lead.fichaFaltando ?? [];
  if (faltam.length) {
    return {
      tom: "neutro",
      texto: `Ficha incompleta: o time jurídico ainda não sabe ${faltam.slice(0, 2).join(" nem ")}.`,
    };
  }
  if (lead.intencao === "contratar") {
    return { tom: "atencao", texto: "Ficha completa e disse que quer o escritório conduzindo. Está pronto para o time." };
  }
  return { tom: "neutro", texto: "Ficha completa, sem prazo sinalizado. Trabalho normal da fila." };
}
