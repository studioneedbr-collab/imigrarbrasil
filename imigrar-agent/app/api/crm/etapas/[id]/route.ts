import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession, forbidden } from "@/lib/auth/guard";
import { normalizarPapel } from "@/lib/auth/papeis";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { AJUDA_MAX, NOME_MAX } from "@/lib/crm/funil";

export const dynamic = "force-dynamic";

function podeDesenhar(role: unknown): boolean {
  const papel = normalizarPapel(role);
  return papel === "admin" || papel === "advogado";
}

const patch = z.object({
  nome: z.string().trim().min(2).max(NOME_MAX).optional(),
  ajuda: z.string().trim().max(AJUDA_MAX).nullable().optional(),
  status: z.enum(["novo", "em_atendimento", "agendado", "fechado", "perdido"]).optional(),
  ordem: z.number().int().min(0).max(99).optional(),
  arquivada: z.boolean().optional(),
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
    const etapa = await getRepository().atualizarEtapa(params.id, input);
    await registrarAcesso(
      auth.session,
      "editou_etapa",
      { tipo: "crm_etapa", id: params.id, detalhe: `${etapa.nome} (${etapa.status})` },
      req,
    );
    return NextResponse.json({ ok: true, etapa });
  } catch (err) {
    console.error("[crm/etapas:PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível salvar a etapa." }, { status: 400 });
  }
}

/**
 * APAGAR A ETAPA DEVOLVE OS CASOS, NÃO OS PERDE.
 *
 * Quem estava nela volta a aparecer pela primeira etapa do mesmo status — o `etapa_id`
 * vira nulo e a distribuição por status assume (ver lib/crm/funil.ts). É por isso que
 * apagar uma coluna cheia é chato e não é destrutivo.
 *
 * A última etapa de um funil não se apaga: um funil sem coluna nenhuma é um quadro que
 * esconde todos os casos de uma vez.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!podeDesenhar(auth.session.role)) return forbidden();

  const repo = getRepository();
  try {
    const todas = await repo.listEtapas();
    const alvo = todas.find((e) => e.id === params.id);
    if (!alvo) return NextResponse.json({ error: "Esta etapa não existe mais." }, { status: 404 });
    const irmas = todas.filter((e) => e.funilId === alvo.funilId && !e.arquivada);
    if (irmas.length <= 1) {
      return NextResponse.json(
        { error: "É a última etapa do funil. Crie outra antes de apagar esta." },
        { status: 400 },
      );
    }
    await repo.excluirEtapa(params.id);
    await registrarAcesso(
      auth.session,
      "apagou_etapa",
      { tipo: "crm_etapa", id: params.id, detalhe: alvo.nome },
      req,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[crm/etapas:DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível apagar a etapa." }, { status: 400 });
  }
}
