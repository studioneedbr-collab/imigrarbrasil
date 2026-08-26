import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";

export const dynamic = "force-dynamic";

/**
 * POLÍTICA DE RETENÇÃO.
 *
 * Conversa descartada (CURIOSO, DPU, FORA_ESCOPO) é a que menos serve ao time e a que
 * mais pesa se vazar: é gente que escreveu contando a situação dela e nem virou caso.
 * Guardar para sempre não protege ninguém.
 *
 * O prazo é configurável porque a auditoria por amostragem precisa de janela: apagar em
 * 7 dias inviabiliza revisar o que o agente descartou. O padrão são 180 dias.
 *
 * Quem foi RESGATADO nunca é apagado por aqui — deixou de ser descarte no momento em que
 * uma pessoa disse que o agente errou.
 */
// Rotas do App Router só exportam campos conhecidos — daí a constante ser local.
const RETENCAO_PADRAO_DIAS = 180;
const CHAVE = "retencao_dias_descartados";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const dias = (await getRepository().getConfig<number>(CHAVE)) ?? RETENCAO_PADRAO_DIAS;
  return NextResponse.json({ dias, padrao: RETENCAO_PADRAO_DIAS });
}

const schema = z.object({
  // Mínimo de 30 dias: abaixo disso a aba de filtradas deixa de ser auditável.
  dias: z.coerce.number().int().min(30).max(3650).optional(),
  executar: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "Informe um prazo entre 30 e 3650 dias." },
      { status: 400 },
    );
  }

  const repo = getRepository();
  if (input.dias) {
    await repo.setConfig(CHAVE, input.dias);
    await registrarAcesso(auth.session, "mudou_retencao", { detalhe: `${input.dias} dias` }, req);
  }

  let apagados: number | null = null;
  if (input.executar) {
    const dias = input.dias ?? (await repo.getConfig<number>(CHAVE)) ?? RETENCAO_PADRAO_DIAS;
    apagados = await repo.purgarDescartados(dias);
    await registrarAcesso(
      auth.session,
      "executou_retencao",
      { detalhe: `${apagados} descartados apagados (${dias} dias)` },
      req,
    );
  }

  return NextResponse.json({ ok: true, apagados });
}
