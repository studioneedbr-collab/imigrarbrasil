import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { requireSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/**
 * A FILA DE APROVAÇÃO — o que o sistema escreveu e ainda não mandou.
 *
 * É o padrão do produto, e não uma etapa de transição: a mensagem automática sai como
 * RASCUNHO, e alguém do time diz enviar, editar ou pular. Follow-up em imigração fala com
 * gente em situação delicada, e o custo de uma frase errada não é uma venda perdida — é
 * uma pessoa que para de pedir ajuda.
 */
export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const toques = await getRepository().listToquesPendentes().catch(() => []);
  return NextResponse.json({ toques });
}
