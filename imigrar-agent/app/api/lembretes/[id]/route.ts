import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { requireSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/** "Já tratei." O lembrete sai do topo de Meus atendimentos e da saúde da operação. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  try {
    await getRepository().concluirLembrete(params.id, auth.session.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[lembretes:concluir]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível concluir o lembrete." }, { status: 400 });
  }
}
