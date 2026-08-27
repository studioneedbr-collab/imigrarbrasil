import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession, forbidden } from "@/lib/auth/guard";
import { normalizarPapel } from "@/lib/auth/papeis";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { NOME_MAX } from "@/lib/crm/funil";

export const dynamic = "force-dynamic";

function podeDesenhar(role: unknown): boolean {
  const papel = normalizarPapel(role);
  return papel === "admin" || papel === "advogado";
}

const patch = z.object({
  nome: z.string().trim().min(2).max(NOME_MAX).optional(),
  descricao: z.string().trim().max(200).nullable().optional(),
  ordem: z.number().int().min(0).max(99).optional(),
  padrao: z.boolean().optional(),
  arquivado: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!podeDesenhar(auth.session.role)) return forbidden();

  let input: z.infer<typeof patch>;
  try {
    input = patch.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  try {
    const funil = await getRepository().atualizarFunil(params.id, input);
    await registrarAcesso(
      auth.session,
      "editou_funil",
      { tipo: "crm_funil", id: params.id, detalhe: funil.nome },
      req,
    );
    return NextResponse.json({ ok: true, funil });
  } catch (err) {
    console.error("[crm/funis:PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível salvar o funil." }, { status: 400 });
  }
}

/**
 * APAGAR O FUNIL NÃO APAGA CASO NENHUM.
 *
 * Os leads que estavam nele voltam a ser distribuídos pelo `atendimentoStatus`, que é o
 * dado do domínio e nunca esteve em jogo aqui — ver o `on delete set null` da migration
 * 026. O que se perde é o desenho das colunas, e é isso que a tela avisa antes.
 *
 * O funil padrão não se apaga: sem ele os casos novos não teriam onde cair.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!podeDesenhar(auth.session.role)) return forbidden();

  const repo = getRepository();
  try {
    const funis = await repo.listFunis();
    const alvo = funis.find((f) => f.id === params.id);
    if (!alvo) return NextResponse.json({ error: "Este funil não existe mais." }, { status: 404 });
    if (alvo.padrao) {
      return NextResponse.json(
        { error: "Este é o funil padrão. Marque outro como padrão antes de apagá-lo." },
        { status: 400 },
      );
    }
    await repo.excluirFunil(params.id);
    await registrarAcesso(
      auth.session,
      "apagou_funil",
      { tipo: "crm_funil", id: params.id, detalhe: alvo.nome },
      req,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[crm/funis:DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível apagar o funil." }, { status: 400 });
  }
}
