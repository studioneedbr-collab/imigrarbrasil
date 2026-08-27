import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireAdmin, requireSession } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { ACAO_CONVERSA, detalheDaMudanca } from "@/lib/agent/estado";

// Conversa + mensagens + lead — usado pela visão em tempo real (polling) do dashboard.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const repo = getRepository();
  const conversation = await repo.getConversation(params.id);
  if (!conversation) {
    return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  }
  // Filtra os tickets no banco (usa idx_transfer_conv). Antes trazia todos os
  // tickets do sistema a cada poll do painel e descartava a maioria em JS.
  const [messages, lead, transferTickets, rascunhos] = await Promise.all([
    repo.listMessages(params.id),
    repo.getLeadByConversation(params.id),
    repo.listTransferTicketsByConversation(params.id),
    // MODO SOMBRA: as respostas que a Ana montou e não enviou, no lugar onde teriam ido.
    // Só as pendentes — as já decididas viraram mensagem de verdade (quando enviadas) ou
    // não têm mais o que decidir, e ficam na fila de sombra para quem quiser o histórico.
    repo.listRascunhos({ conversationId: params.id, status: "pendente" }).catch(() => []),
  ]);
  return NextResponse.json({ conversation, messages, lead, transferTickets, rascunhos });
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

    // AUDITORIA DO NÍVEL 3. Os três níveis de ativação registram do mesmo jeito: autor,
    // timestamp, estado anterior e novo. Sem esta linha, o nível que mais muda de estado
    // no dia a dia seria justamente o único invisível no log.
    await registrarAcesso(
      auth.session,
      ACAO_CONVERSA,
      {
        tipo: "conversa",
        id: params.id,
        detalhe: iaActive
          ? detalheDaMudanca("assumida por um humano", "devolvida ao agente")
          : detalheDaMudanca("com o agente", "assumida por um humano"),
      },
      req,
    );
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
