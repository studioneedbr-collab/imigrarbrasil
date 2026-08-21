import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession } from "@/lib/auth/guard";
import { sendMessage } from "@/lib/whatsapp/send";

export const dynamic = "force-dynamic";

const schema = z.object({ message: z.string().min(1).max(4000) });

// Resposta MANUAL do atendente: envia direto pro WhatsApp do cliente (via Z-API),
// registra no histórico e mantém a conversa com o humano (IA pausada = status 'transferred').
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let message: string;
  try {
    ({ message } = schema.parse(await req.json()));
  } catch {
    return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });
  }

  const repo = getRepository();
  const conv = await repo.getConversation(params.id);
  if (!conv) return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  if (conv.whatsappNumber.startsWith("sim:")) {
    return NextResponse.json({ error: "Conversa do simulador não envia WhatsApp real." }, { status: 400 });
  }

  try {
    await sendMessage(conv.whatsappNumber, message);
    const saved = await repo.addMessage(params.id, "assistant", message);
    // ASSUMIR A CONVERSA: registra QUEM assumiu (antes só marcava o status 'transferred',
    // o mesmo que a Shayene grava ao encaminhar pro setor — por isso toda conversa
    // encaminhada aparecia no painel como "Você assumiu esta conversa").
    await repo.assumeConversation(params.id, auth.session.email).catch(() => {});
    await repo.updateLastMessageAt(params.id).catch(() => {});
    return NextResponse.json({ ok: true, message: saved });
  } catch (err) {
    console.error("[conversations:reply]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Falha ao enviar a mensagem." }, { status: 502 });
  }
}
