import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { CLASSIFICACOES } from "@/lib/domain/types";
import type { Classificacao } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/**
 * RECLASSIFICAR — e, quando a classificação sai do descarte, RESGATAR.
 *
 * É o mesmo movimento visto de dois lados. O par (de → para) é o dado que calibra o
 * agente; o subconjunto "saiu de CURIOSO/DPU/FORA_ESCOPO" é a taxa de resgate, a métrica
 * que denuncia um agente filtrando demais — o modo de falhar que parece ótimo nos
 * números enquanto destrói o negócio em silêncio.
 *
 * Por isso o registro acontece no repositório, e não no clique: qualquer caminho que
 * mude a classificação alimenta as duas leituras.
 */
const schema = z.object({
  classificacao: z.enum(CLASSIFICACOES as [Classificacao, ...Classificacao[]]),
  motivo: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Classificação inválida." }, { status: 400 });
  }

  try {
    const lead = await getRepository().reclassificarLead(
      params.id,
      input.classificacao,
      auth.session.email,
      input.motivo?.trim(),
    );
    await registrarAcesso(
      auth.session,
      lead.resgatadoPor === auth.session.email && lead.resgatadoEm ? "resgatou_lead" : "reclassificou_lead",
      { tipo: "lead", id: params.id, detalhe: input.classificacao },
      req,
    );
    return NextResponse.json({ ok: true, lead });
  } catch (err) {
    console.error("[leads/classificacao:POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível reclassificar." }, { status: 400 });
  }
}
