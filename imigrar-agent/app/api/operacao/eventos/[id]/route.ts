import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { requireSession } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";

export const dynamic = "force-dynamic";

/**
 * "Já tratei este." Marca a falha como resolvida.
 *
 * Não é um botão de esconder: alguém ouviu o áudio, entendeu o que a pessoa disse e
 * seguiu o atendimento. Fica registrado quem tratou, porque a pergunta que aparece
 * depois é "esse áudio alguém chegou a ouvir?".
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  try {
    await getRepository().resolverEventoOperacao(params.id, auth.session.email);
    await registrarAcesso(auth.session, "tratou_falha", { tipo: "evento", id: params.id }, req);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[eventos:POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível marcar como tratado." }, { status: 400 });
  }
}
