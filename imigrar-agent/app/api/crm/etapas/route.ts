import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession, forbidden } from "@/lib/auth/guard";
import { normalizarPapel } from "@/lib/auth/papeis";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { AJUDA_MAX, NOME_MAX } from "@/lib/crm/funil";
import { COLUNAS } from "@/lib/fila/kanban";
import type { AtendimentoStatus } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/**
 * CRIAR ETAPA.
 *
 * `status` é obrigatório e não tem default: é a amarração que faz a etapa nova continuar
 * respondendo às regras do domínio — a fila, o encerramento, o motivo obrigatório em
 * "perdido". Uma etapa sem status seria uma coluna decorativa, e um caso parado numa
 * coluna decorativa é um caso que ninguém vê sair.
 */
function podeDesenhar(role: unknown): boolean {
  const papel = normalizarPapel(role);
  return papel === "admin" || papel === "advogado";
}

/**
 * O STATUS VEM DE `COLUNAS`, e não de uma lista escrita aqui.
 *
 * Havia uma cópia à mão — sem 'proposta_enviada', porque a etapa comercial (migration
 * 027) nasceu depois dela. O efeito: o seletor da tela OFERECIA "Proposta enviada", e
 * salvar respondia 400 "Dados inválidos". Foi o mesmo esquecimento que deixou o check do
 * banco para trás, na mesma etapa, e nenhum dos dois dava sinal antes de alguém tentar.
 *
 * Derivar da constante fecha a porta: acrescentar uma coluna ao quadro passa a valer aqui
 * sem ninguém precisar lembrar deste arquivo.
 */
const STATUS_DE_ETAPA = z.enum(COLUNAS as [AtendimentoStatus, ...AtendimentoStatus[]]);

const criar = z.object({
  funilId: z.string().min(1),
  nome: z.string().trim().min(2, "Dê um nome à etapa.").max(NOME_MAX),
  ajuda: z.string().trim().max(AJUDA_MAX).nullable().optional(),
  status: STATUS_DE_ETAPA,
  ordem: z.number().int().min(0).max(99).optional(),
});

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

  const repo = getRepository();
  try {
    const funis = await repo.listFunis();
    if (funis.length && !funis.some((f) => f.id === input.funilId)) {
      return NextResponse.json({ error: "Este funil não existe mais." }, { status: 404 });
    }
    const etapa = await repo.criarEtapa(input);
    await registrarAcesso(
      auth.session,
      "criou_etapa",
      { tipo: "crm_etapa", id: etapa.id, detalhe: `${etapa.nome} (${etapa.status})` },
      req,
    );
    return NextResponse.json({ ok: true, etapa });
  } catch (err) {
    console.error("[crm/etapas:POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível criar a etapa." }, { status: 400 });
  }
}
