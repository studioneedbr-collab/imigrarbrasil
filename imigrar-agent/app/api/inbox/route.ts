import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guard";
import { getRepository } from "@/lib/data";
import { comQuemEsta } from "@/lib/crm/agente-na-transferencia";

export const dynamic = "force-dynamic";

// Alimenta o chat flutuante: conversas mais recentes + quantas estão "não respondidas"
// (última mensagem é do cliente). Usado para o badge, o som e a lista rápida.
export async function GET() {
  // A sessão é conferida AQUI, e não só no middleware: ele só olha se o cookie é válido, e
  // uma conta desativada continuava lendo esta rota. Ver getSession (lib/auth/guard.ts).
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const repo = getRepository();
  const convs = [...(await repo.listConversations())]
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
    .slice(0, 20);

  const ids = convs.map((c) => c.id);
  const [porConversa, leads, usuarios] = await Promise.all([
    repo.listMessagesForConversations(ids),
    repo.listLeadsDasConversas(ids).catch(() => []),
    repo.listUsers().catch(() => []),
  ]);
  const donoDe = new Map(leads.map((l) => [l.conversationId, l.responsavelId]));
  const nomePorId = new Map(usuarios.map((u) => [u.id, u.name?.trim() || u.email]));

  const items = convs.map((c) => {
      const msgs = porConversa.get(c.id) ?? [];
      const last = msgs[msgs.length - 1];
      return {
        id: c.id,
        name: c.contactName || c.whatsappNumber,
        lastText: (last?.content ?? "").slice(0, 90),
        lastAt: last?.createdAt ?? c.createdAt,
        unanswered: last?.role === "user",
        status: c.status,
        comQuem: comQuemEsta(c, donoDe.get(c.id), nomePorId).comQuem,
      };
  });

  const count = items.filter((i) => i.unanswered).length;
  return NextResponse.json({ count, items });
}
