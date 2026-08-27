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
import { ehEnsaio } from "@/lib/domain/ambiente";
import { qualificacaoFaltando } from "@/lib/domain/ficha";
import type { Conversation, Lead } from "@/lib/domain/types";

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
  const enriquecidos = await enriquecer(leads, { conversas, usuarios, instancias });

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

/**
 * A FILA PAGINADA — a que a tela inicial usa.
 *
 * A diferença para `carregarCargaDaFila` está no que NÃO é carregado: aqui não vem a
 * tabela de leads inteira, não vem a de conversas inteira, e não existe teto. O banco já
 * devolve os leads com prazo (todos) e uma página do resto, na ordem certa.
 *
 * `total` deixou de ser "quantos leads existem" e passou a ser "quantos existem NO BLOCO
 * 3". Parece detalhe e era a origem do aviso amarelo que aparecia sem nada ter sido
 * cortado: a tela comparava um numerador já filtrado (sem ensaio, sem filtradas, sem
 * caso encerrado) com um denominador que contava a tabela toda.
 */
export async function carregarFilaPaginada(
  agora: Date = new Date(),
  opcoes: { pagina: number; porPagina: number },
): Promise<{
  fila: Fila;
  /** Quantos leads existem no bloco 3, para a paginação. */
  totalNormal: number;
  /** Quantas conversas o agente filtrou — só o número, para o link de Filtradas. */
  totalFiltradas: number;
}> {
  const repo = getRepository();
  const { comPrazo, normal, totalNormal, totalFiltradas } = await repo.listLeadsDaFila(opcoes);
  const leads = [...comPrazo, ...normal];
  const enriquecidos = await enriquecer(leads);
  return { fila: montarFila(enriquecidos, agora), totalNormal, totalFiltradas };
}

/**
 * O que a fila precisa saber e não está na tabela `leads`: em que ambiente a conversa
 * aconteceu, se há relógio de primeira resposta humana correndo, qual o SLA da instância,
 * quando foi o último contato, quem falou por último, quem é o responsável e o que ainda
 * falta na ficha.
 *
 * As listas de apoio (conversas, usuários, instâncias) podem vir prontas de quem já as
 * carregou; quando não vêm, são buscadas SÓ para os leads desta chamada. É essa diferença
 * que faz a tela inicial deixar de ler a tabela de conversas inteira a cada carregamento.
 */
async function enriquecer(
  leads: Lead[],
  prontos?: {
    conversas: Conversation[];
    usuarios: { id: string; name?: string | null; email: string }[];
    instancias: { id: string; slaMinutos: number }[];
  },
): Promise<LeadDaFila[]> {
  const repo = getRepository();
  const conversationIds = leads.map((l) => l.conversationId);
  const [conversas, usuarios, instancias, mensagensPorConversa] = await Promise.all([
    prontos ? Promise.resolve(prontos.conversas) : repo.listConversationsByIds(conversationIds).catch(() => []),
    prontos ? Promise.resolve(prontos.usuarios) : repo.listUsers().catch(() => []),
    prontos ? Promise.resolve(prontos.instancias) : repo.listInstancias().catch(() => []),
    repo.listMessagesForConversations(conversationIds),
  ]);

  const nomePorId = new Map(usuarios.map((u) => [u.id, u.name || u.email]));
  const convPorId = new Map(conversas.map((c) => [c.id, c]));
  const slaPorInstancia = new Map(instancias.map((i) => [i.id, i.slaMinutos]));

  return leads.map((lead) => {
    const msgs = mensagensPorConversa.get(lead.conversationId) ?? [];
    const ultima = msgs.length ? msgs[msgs.length - 1] : null;
    const conv = convPorId.get(lead.conversationId);
    return {
      ...lead,
      // `producao` como padrão: conversa anterior à migration 023 é operação real até
      // prova em contrário, e errar para o lado de "some da fila" esconderia caso de
      // gente.
      //
      // O SIMULADOR É A EXCEÇÃO, e ela é lida do próprio número. O simulador nasce sem
      // instância, então caía no padrão e desaguava na fila de trabalho: `sim:v2-5`,
      // `sim:v2-12`, `sim:at-8-3` apareceram no meio de conversa real, no quadro e na
      // fila. A marcação certa passou a ser gravada na criação (app/api/simulate), mas
      // ler o prefixo aqui conserta também tudo que já foi ensaiado antes disso — sem
      // depender de alguém rodar um UPDATE no banco.
      ambiente: ehEnsaio(conv?.whatsappNumber) ? ("teste" as const) : conv?.ambiente ?? ("producao" as const),
      aguardandoHumanoDesde: conv?.aguardandoHumanoDesde ?? null,
      slaMinutos: (conv?.instanciaId ? slaPorInstancia.get(conv.instanciaId) : null) ?? 30,
      ultimoContatoEm: ultima?.createdAt ?? lead.updatedAt,
      // `assistant` cobre tanto a Ana quanto um atendente humano respondendo pelo painel:
      // nos dois casos a bola está com a pessoa do outro lado, que é o que importa aqui.
      ultimaMensagemDe: ultima?.role ?? null,
      responsavelNome: lead.responsavelId ? nomePorId.get(lead.responsavelId) ?? null : null,
      // A mesma regra que segura o encaminhamento no atendimento diz aqui o que falta
      // perguntar. Uma definição só de "ficha mínima" — ver lib/domain/ficha.ts.
      fichaFaltando: qualificacaoFaltando(lead).faltam,
    };
  });
}
