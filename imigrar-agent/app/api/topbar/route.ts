import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guard";
import { getRepository } from "@/lib/data";
import { rotuloDoTicket } from "@/lib/crm/agente-na-transferencia";
import { getZapiConnected } from "@/lib/whatsapp/config";

export const dynamic = "force-dynamic";

// Alimenta a barra de topo: transferências recentes (para o sino) + status do WhatsApp.
export async function GET() {
  // A sessão é conferida AQUI, e não só no middleware: ele só olha se o cookie é válido, e
  // uma conta desativada continuava lendo esta rota. Ver getSession (lib/auth/guard.ts).
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const repo = getRepository();
  const tickets = await repo.listTransferTickets();

  const recentes = [...tickets].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);
  const [leads, usuarios] = await Promise.all([
    repo.listLeadsDasConversas([...new Set(recentes.map((t) => t.conversationId))]).catch(() => []),
    repo.listUsers().catch(() => []),
  ]);
  const donoDe = new Map(leads.map((l) => [l.conversationId, l.responsavelId]));
  const nomePorId = new Map(usuarios.map((u) => [u.id, u.name?.trim() || u.email]));

  const transfers = recentes
    .map((t) => ({
      id: t.id,
      conversationId: t.conversationId,
      rotulo: rotuloDoTicket(t, nomePorId.get(donoDe.get(t.conversationId) ?? "") ?? null),
      nome: t.dossie?.nome ?? t.dossie?.empresa ?? null,
      createdAt: t.createdAt,
    }));

  // "Novos" = transferências nas últimas 24h (sinal que não pode passar despercebido).
  const dayAgo = Date.now() - 24 * 3600_000;
  const unseen = transfers.filter((t) => new Date(t.createdAt).getTime() >= dayAgo).length;

  // Status real do WhatsApp via Z-API (provedor ativo), não da Meta Cloud API.
  const connected = await getZapiConnected();

  return NextResponse.json({
    transfers,
    unseen,
    whatsapp: {
      connected,
      provider: connected ? "Z-API" : null,
    },
  });
}
