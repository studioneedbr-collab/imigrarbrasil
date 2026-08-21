import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { getZapiConnected } from "@/lib/whatsapp/config";

export const dynamic = "force-dynamic";

// Alimenta a barra de topo: transferências recentes (para o sino) + status do WhatsApp.
export async function GET() {
  const repo = getRepository();
  const tickets = await repo.listTransferTickets();

  const transfers = [...tickets]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12)
    .map((t) => ({
      id: t.id,
      conversationId: t.conversationId,
      reason: t.reason,
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
