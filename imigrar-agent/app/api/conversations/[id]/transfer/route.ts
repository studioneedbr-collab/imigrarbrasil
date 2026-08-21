import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import { sendMessage } from "@/lib/whatsapp/send";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  setor: z.string().min(1, "Informe o setor."),
  pessoa: z.string().min(1, "Informe a pessoa."),
});

// Transferência MANUAL do atendimento para um humano: o admin escolhe setor + pessoa,
// entra uma nota na conversa ("Fulano, do Comercial, entrou na conversa"), a conversa
// é marcada como transferida e um ticket é aberto (mesmo fluxo da transferência automática).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { setor, pessoa } = bodySchema.parse(await req.json());
    const repo = getRepository();

    const conv = await repo.getConversation(params.id);
    if (!conv) return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });

    const lead = await repo.getLeadByConversation(params.id);

    // Nota visível na conversa (role assistant — o schema de messages só aceita user/assistant).
    const note = `🔔 ${pessoa}, do setor ${setor}, entrou na conversa e assumirá o atendimento a partir de agora.`;
    await repo.addMessage(params.id, "assistant", note);
    // Transferência manual entrega a conversa a uma PESSOA nomeada — então ela conta
    // como assumida (a Shayene se cala). Diferente do encaminhamento automático da
    // Shayene pro setor, em que ninguém pegou a conversa ainda e ela segue atendendo.
    await repo.updateConversation(params.id, { handedOffTo: `${pessoa} (${setor})`, handoffReason: "Transferência manual pelo painel." });
    await repo.assumeConversation(params.id, pessoa);

    await repo.createTransferTicket({
      conversationId: params.id,
      clienteId: conv.clienteId,
      reason: `manual:${setor}`,
      priority: "normal",
      dossie: {
        nome: lead?.contactName ?? conv.contactName ?? undefined,
        empresa: lead?.companyName ?? undefined,
        servicos: lead?.servicesInterested ?? undefined,
        necessidade: `Transferência manual para ${pessoa} (${setor}).`,
      },
    });

    // Avisa a equipe no WhatsApp, se configurado (mesmo canal da transferência automática).
    if (env.teamWhatsapp) {
      const link = `${env.appUrl}/dashboard/conversations/${params.id}`;
      await sendMessage(
        env.teamWhatsapp,
        `🔔 *Transferência manual*\n${pessoa} (${setor}) assumiu uma conversa.\nAbrir: ${link}`,
      ).catch((e) => console.error("[transfer:manual] falha ao notificar equipe:", e instanceof Error ? e.message : e));
    }

    return NextResponse.json({ ok: true, note });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
    }
    console.error("[conversations/transfer:POST]", err);
    return NextResponse.json({ error: "Falha ao transferir a conversa." }, { status: 400 });
  }
}
