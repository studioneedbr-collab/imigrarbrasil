import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession, forbidden } from "@/lib/auth/guard";
import { normalizarPapel } from "@/lib/auth/papeis";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { NOME_MAX } from "@/lib/crm/funil";

export const dynamic = "force-dynamic";

/**
 * OS FUNIS DO CRM.
 *
 * LER é de todo mundo do painel: sem os funis não há quadro, e o quadro é a tela de
 * trabalho de quem atende.
 *
 * MEXER não é. Um funil não é preferência pessoal — é o desenho do quadro que a equipe
 * inteira usa, e renomear uma coluna no meio da tarde muda o que todos os outros estão
 * lendo. Fica com advogado e administrador, que é a mesma régua de quem pode exportar.
 */
function podeDesenhar(role: unknown): boolean {
  const papel = normalizarPapel(role);
  return papel === "admin" || papel === "advogado";
}

const criar = z.object({
  nome: z.string().trim().min(2, "Dê um nome ao funil.").max(NOME_MAX),
  descricao: z.string().trim().max(200).optional().nullable(),
  padrao: z.boolean().optional(),
});

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const repo = getRepository();
  const [funis, etapas] = await Promise.all([
    repo.listFunis().catch(() => []),
    repo.listEtapas().catch(() => []),
  ]);
  return NextResponse.json({ funis, etapas });
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!podeDesenhar(auth.session.role)) return forbidden();

  let input: z.infer<typeof criar>;
  try {
    input = criar.parse(await req.json());
  } catch (err) {
    const issue = err instanceof z.ZodError ? err.issues[0]?.message : null;
    return NextResponse.json({ error: issue ?? "Dados inválidos." }, { status: 400 });
  }

  try {
    const funil = await getRepository().criarFunil(input);
    await registrarAcesso(
      auth.session,
      "criou_funil",
      { tipo: "crm_funil", id: funil.id, detalhe: funil.nome },
      req,
    );
    return NextResponse.json({ ok: true, funil });
  } catch (err) {
    console.error("[crm/funis:POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível criar o funil." }, { status: 400 });
  }
}
