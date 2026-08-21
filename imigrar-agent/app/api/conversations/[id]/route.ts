import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireAdmin, requireSession } from "@/lib/auth/guard";

// Conversa + mensagens + lead — usado pela visão em tempo real (polling) do dashboard.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const repo = getRepository();
  const conversation = await repo.getConversation(params.id);
  if (!conversation) {
    return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  }
  // Filtra os tickets no banco (usa idx_transfer_conv). Antes trazia todos os
  // tickets do sistema a cada poll do painel e descartava a maioria em JS.
  const [messages, lead, transferTickets] = await Promise.all([
    repo.listMessages(params.id),
    repo.getLeadByConversation(params.id),
    repo.listTransferTicketsByConversation(params.id),
  ]);
  return NextResponse.json({ conversation, messages, lead, transferTickets });
}

// Pausar/retomar a IA nesta conversa. Pausar = ASSUMIR o atendimento (grava quem
// assumiu; só aí a Shayene fica em silêncio no WhatsApp); retomar = devolver pra ela.
const patchSchema = z.object({ iaActive: z.boolean() });
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  let iaActive: boolean;
  try {
    ({ iaActive } = patchSchema.parse(await req.json()));
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }
  try {
    const repo = getRepository();
    if (iaActive) await repo.releaseConversation(params.id);
    else await repo.assumeConversation(params.id, auth.session.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[conversations:PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Falha ao atualizar a conversa." }, { status: 400 });
  }
}

// Exclui a conversa e todo o histórico (mensagens, lead e tickets caem por cascade).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    await getRepository().deleteConversation(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[conversations:DELETE]", err);
    return NextResponse.json({ error: "Falha ao excluir a conversa." }, { status: 400 });
  }
}
