import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

// Alimenta o chat flutuante: conversas mais recentes + quantas estão "não respondidas"
// (última mensagem é do cliente). Usado para o badge, o som e a lista rápida.
export async function GET() {
  const repo = getRepository();
  const convs = [...(await repo.listConversations())]
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
    .slice(0, 20);

  const items = await Promise.all(
    convs.map(async (c) => {
      const msgs = await repo.listMessages(c.id);
      const last = msgs[msgs.length - 1];
      return {
        id: c.id,
        name: c.contactName || c.whatsappNumber,
        lastText: (last?.content ?? "").slice(0, 90),
        lastAt: last?.createdAt ?? c.createdAt,
        unanswered: last?.role === "user",
        status: c.status,
      };
    }),
  );

  const count = items.filter((i) => i.unanswered).length;
  return NextResponse.json({ count, items });
}
