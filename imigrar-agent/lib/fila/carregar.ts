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

export async function carregarLeadsDaFila(): Promise<LeadDaFila[]> {
  const repo = getRepository();
  const [leads, usuarios] = await Promise.all([repo.listLeads(), repo.listUsers().catch(() => [])]);
  const nomePorId = new Map(usuarios.map((u) => [u.id, u.name || u.email]));

  const mensagensPorConversa = await repo.listMessagesForConversations(
    leads.map((l) => l.conversationId),
  );

  return leads.map((lead) => {
    const msgs = mensagensPorConversa.get(lead.conversationId) ?? [];
    const ultima = msgs.length ? msgs[msgs.length - 1] : null;
    return {
      ...lead,
      ultimoContatoEm: ultima?.createdAt ?? lead.updatedAt,
      // `assistant` cobre tanto a Ana quanto um atendente humano respondendo pelo painel:
      // nos dois casos a bola está com a pessoa do outro lado, que é o que importa aqui.
      ultimaMensagemDe: ultima?.role ?? null,
      responsavelNome: lead.responsavelId ? nomePorId.get(lead.responsavelId) ?? null : null,
    };
  });
}

export async function carregarFila(agora: Date = new Date()): Promise<{ fila: Fila; leads: LeadDaFila[] }> {
  const leads = await carregarLeadsDaFila();
  return { fila: montarFila(leads, agora), leads };
}
