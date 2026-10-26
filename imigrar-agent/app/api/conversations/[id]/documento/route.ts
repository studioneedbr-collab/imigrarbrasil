import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { requireSession } from "@/lib/auth/guard";
import { sendDocument } from "@/lib/whatsapp/send";
import { DOCUMENTO_MAX_BYTES, guardarDocumentoEnviado } from "@/lib/whatsapp/documento-enviado";

export const dynamic = "force-dynamic";

// O ATENDENTE MANDA UM ARQUIVO AO CLIENTE (orçamento, proposta). Mesmo efeito da resposta
// manual: envia pelo WhatsApp, entra no histórico e a conversa fica com quem mandou.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let arquivo: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("arquivo");
    arquivo = f instanceof File ? f : null;
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }
  if (!arquivo || arquivo.size === 0) {
    return NextResponse.json({ error: "Escolha um arquivo." }, { status: 400 });
  }
  if (arquivo.size > DOCUMENTO_MAX_BYTES) {
    return NextResponse.json({ error: "O arquivo passa de 4 MB. Reduza o PDF ou divida em partes." }, { status: 400 });
  }

  const repo = getRepository();
  const conv = await repo.getConversation(params.id);
  if (!conv) return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  if (conv.whatsappNumber.startsWith("sim:")) {
    return NextResponse.json({ error: "Conversa do simulador não envia WhatsApp real." }, { status: 400 });
  }

  const guardado = await guardarDocumentoEnviado(
    params.id,
    arquivo.name,
    new Uint8Array(await arquivo.arrayBuffer()),
  );
  if (!guardado.ok) return NextResponse.json({ error: guardado.erro }, { status: 400 });

  try {
    await sendDocument(conv.whatsappNumber, guardado.url, guardado.nome);
    const saved = await repo.addMessage(params.id, "assistant", `📎 ${guardado.nome}`, undefined, {
      url: guardado.url,
      kind: guardado.kind,
      name: guardado.nome,
    });
    await repo.assumeConversation(params.id, auth.session.email).catch(() => {});
    await repo.updateLastMessageAt(params.id).catch(() => {});
    return NextResponse.json({ ok: true, message: saved });
  } catch (err) {
    console.error("[conversations:documento]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Falha ao enviar o documento pelo WhatsApp." }, { status: 502 });
  }
}
