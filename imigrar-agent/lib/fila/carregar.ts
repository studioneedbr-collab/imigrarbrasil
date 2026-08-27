// A FILA, MONTADA A PARTIR DO BANCO.
//
// A regra de ordem vive em `lib/fila/ordenacao.ts`, pura e testada. Aqui é só o que ela
// precisa saber e não está na tabela `leads`: quando foi o último contato daquela
// conversa (é por aí que "parado" se mede) e o nome de quem é o responsável.
//
// Uma ida ao banco por lista, não uma por lead: a visão geral já teve a versão com um
// `listMessages` por conversa dentro de um for, e o painel parecia travado depois do
// login.

import { getRepository } from "@/lib/data";
import { montarFila, type Fila, type LeadDaFila } from "@/lib/fila/ordenacao";

export interface CargaDaFila {
  leads: LeadDaFila[];
  /** Quantos existem no banco. Só difere de `leads.length` quando o teto cortou. */
  total: number;
}

/**
 * `limite` é o TETO DE CARGA — ver lib/fila/paginacao.ts. As telas de trabalho (Fila,
 * Filtradas, Kanban) passam o teto; as que precisam do universo inteiro para estar
 * corretas — Métricas e a exportação — não passam nada e continuam vendo tudo. Capar
 * métrica seria transformar "quantos casos entraram" numa resposta errada e silenciosa.
 */
export async function carregarCargaDaFila(
  opcoes: { limite?: number } = {},
): Promise<CargaDaFila> {
  const repo = getRepository();
  // As conversas e as instâncias entram aqui por causa da ativação do agente: é a
  // conversa que diz em que AMBIENTE o caso aconteceu (teste não entra na fila de
  // trabalho) e se há um relógio de primeira resposta humana correndo; é a instância que
  // diz qual é o SLA desse relógio. Duas listas inteiras, e não uma consulta por lead —
  // esta é a tela inicial, e ela já teve a versão com um SELECT dentro de um for.
  const [leads, usuarios, total, conversas, instancias] = await Promise.all([
    repo.listLeads(opcoes.limite ? { limite: opcoes.limite } : undefined),
    repo.listUsers().catch(() => []),
    opcoes.limite ? repo.contarLeads().catch(() => 0) : Promise.resolve(0),
    repo.listConversations().catch(() => []),
    repo.listInstancias().catch(() => []),
  ]);
  const nomePorId = new Map(usuarios.map((u) => [u.id, u.name || u.email]));
  const convPorId = new Map(conversas.map((c) => [c.id, c]));
  const slaPorInstancia = new Map(instancias.map((i) => [i.id, i.slaMinutos]));

  const mensagensPorConversa = await repo.listMessagesForConversations(
    leads.map((l) => l.conversationId),
  );

  const enriquecidos = leads.map((lead) => {
    const msgs = mensagensPorConversa.get(lead.conversationId) ?? [];
    const ultima = msgs.length ? msgs[msgs.length - 1] : null;
    const conv = convPorId.get(lead.conversationId);
    return {
      ...lead,
      // `producao` como padrão: conversa anterior à migration 023, ou criada por um
      // caminho sem instância (simulador), é operação real até prova em contrário.
      // Errar para o lado de "some da fila" seria esconder caso de gente.
      ambiente: conv?.ambiente ?? "producao",
      aguardandoHumanoDesde: conv?.aguardandoHumanoDesde ?? null,
      slaMinutos: (conv?.instanciaId ? slaPorInstancia.get(conv.instanciaId) : null) ?? 30,
      ultimoContatoEm: ultima?.createdAt ?? lead.updatedAt,
      // `assistant` cobre tanto a Ana quanto um atendente humano respondendo pelo painel:
      // nos dois casos a bola está com a pessoa do outro lado, que é o que importa aqui.
      ultimaMensagemDe: ultima?.role ?? null,
      responsavelNome: lead.responsavelId ? nomePorId.get(lead.responsavelId) ?? null : null,
    };
  });

  return { leads: enriquecidos, total: opcoes.limite ? total : enriquecidos.length };
}

/** Atalho para quem só quer a lista — Métricas e "Meus atendimentos" usam assim. */
export async function carregarLeadsDaFila(
  opcoes: { limite?: number } = {},
): Promise<LeadDaFila[]> {
  return (await carregarCargaDaFila(opcoes)).leads;
}

export async function carregarFila(
  agora: Date = new Date(),
  opcoes: { limite?: number } = {},
): Promise<{ fila: Fila; leads: LeadDaFila[]; total: number }> {
  const { leads, total } = await carregarCargaDaFila(opcoes);
  return { fila: montarFila(leads, agora), leads, total };
}
