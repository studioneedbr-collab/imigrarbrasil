import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/guard";
import { reconectarInstancia } from "@/lib/whatsapp/config";

export const dynamic = "force-dynamic";

/**
 * RECONECTAR UMA INSTÂNCIA. É de admin e é POST: reinicia a sessão do WhatsApp da
 * empresa, o que derruba e reergue a linha por alguns segundos. Não é o tipo de coisa
 * que o prefetch de um navegador deve poder disparar sozinho.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const inst = (await getRepository().listInstancias()).find((i) => i.id === params.id);
  if (!inst) return NextResponse.json({ error: "Instância não encontrada." }, { status: 404 });

  return NextResponse.json(await reconectarInstancia(inst));
}
