import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { requireSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// Documentos recebidos por WhatsApp. Sem ?conversationId traz os mais recentes de
// todas as conversas (página Documentos); com ele, só os daquele contato (painel
// lateral da conversa).
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const conversationId = req.nextUrl.searchParams.get("conversationId") ?? undefined;
  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 200;

  try {
    const documents = await getRepository().listDocuments({ conversationId, limit });
    return NextResponse.json({ documents });
  } catch (err) {
    // Sem a migration 009 as colunas de mídia não existem — a tela mostra vazio
    // em vez de quebrar.
    console.error("[documentos:GET]", err instanceof Error ? err.message : err);
    return NextResponse.json({ documents: [] });
  }
}
