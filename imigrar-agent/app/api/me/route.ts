import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/guard";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

// Quem é o usuário logado (para o controle de acesso por setor no painel).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = await getRepository().getUserByEmail(session.email);
  return NextResponse.json({
    email: session.email,
    // O NOME importa na barra lateral: "Cassio" identifica a conta mais rápido do que um
    // e-mail truncado, e o e-mail continua ali embaixo para desempatar contas parecidas.
    name: user?.name ?? null,
    role: session.role,
    /** A conta dona do painel — a que não se apaga, não se desativa e não se rebaixa. */
    dono: user?.dono ?? false,
    // Admin (ou sem setor) enxerga tudo; senão fica restrito a este setor.
    setor: session.role === "admin" ? null : user?.setor ?? null,
  });
}
