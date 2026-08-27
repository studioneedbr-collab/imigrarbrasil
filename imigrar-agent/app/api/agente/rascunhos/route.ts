import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { requireSession } from "@/lib/auth/guard";
import type { RascunhoStatus } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

// MODO SOMBRA — a fila de rascunhos.
//
// O que a Ana teria respondido, esperando decisão humana. É esta lista que permite
// avaliá-la contra conversa real durante a fase de testes sem nenhum risco: nada daqui
// foi enviado, e nada sai daqui sem alguém clicar.

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const conversationId = sp.get("conversa") ?? undefined;

  const rascunhos = await getRepository().listRascunhos({
    conversationId,
    // Sem filtro explícito a fila mostra o que está esperando decisão — que é a pergunta
    // que ela responde. `status=todos` traz o histórico, para ver o que já foi decidido.
    status: status === "todos" ? undefined : ((status as RascunhoStatus) ?? "pendente"),
    limit: Number(sp.get("limite") ?? 100),
  });

  return NextResponse.json({
    rascunhos,
    pendentes: rascunhos.filter((r) => r.status === "pendente").length,
  });
}
