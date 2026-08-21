import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { processMessage } from "@/lib/agent";
import { requireSession } from "@/lib/auth/guard";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

// Prefixo que marca uma conversa criada pelo simulador. Conversas reais têm o
// número de WhatsApp do cliente e nunca começam com isto.
const SIM_PREFIX = "sim:";

const schema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1).max(4000),
});

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  // Cada chamada consome tokens do DeepSeek. Sem limite, uma sessão válida
  // (ou um cookie vazado) vira uma conta de API aberta.
  const limit = rateLimit(`simulate:${clientIp(req.headers)}`, { limit: 30, windowSeconds: 60 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Muitas mensagens em sequência. Aguarde alguns segundos." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const { conversationId, message } = schema.parse(await req.json());
    const repo = getRepository();

    let conv;
    if (conversationId) {
      conv = await repo.getConversation(conversationId);
      if (!conv) {
        // Não cria conversa nova silenciosamente: sinaliza que o contexto se perdeu
        // (instância serverless reciclada). O front limpa o id e recomeça.
        return NextResponse.json({ error: "conversation_not_found", conversationId }, { status: 404 });
      }
      // Trava central: o simulador só opera sobre conversas do próprio simulador.
      // Sem isto, informar o id de uma conversa real permitia injetar mensagens no
      // histórico daquele cliente, avançar a máquina de estados, abrir tickets de
      // transferência falsos e gerar propostas em nome dele.
      if (!conv.whatsappNumber.startsWith(SIM_PREFIX)) {
        return NextResponse.json(
          { error: "O simulador não pode operar sobre uma conversa real de cliente." },
          { status: 403 },
        );
      }
    } else {
      // randomUUID e não Date.now(): duas aberturas no mesmo milissegundo
      // colidiam no unique de whatsapp_number.
      conv = await repo.getOrCreateConversation(`${SIM_PREFIX}${randomUUID()}`);
    }

    const res = await processMessage({ conversationId: conv.id, userText: message });

    return NextResponse.json({
      conversationId: conv.id,
      reply: res.reply,
      toolCalls: res.toolCalls,
      status: res.status,
    });
  } catch (err) {
    console.error("[simulate] erro:", err instanceof Error ? err.message : "erro desconhecido");
    return NextResponse.json({ error: "Falha ao processar" }, { status: 400 });
  }
}
