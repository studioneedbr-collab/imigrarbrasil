import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";

export const dynamic = "force-dynamic";

/**
 * CONFIRMAR PRAZO — o único caminho por onde uma data de prazo entra no sistema.
 *
 * O agente sinalizou que existe prazo. Alguém ligou, perguntou, olhou o documento e
 * confirmou. Só agora existe data, e ela vem com o nome de quem confirmou colado nela.
 *
 * A data limite é digitada, não calculada. Quisemos derivá-la da data da notificação
 * mais um prazo legal e não dá: o prazo depende do tipo de ato, de quando a pessoa foi
 * efetivamente notificada (que não é o dia em que ela pegou o papel) e de suspensões.
 * Quem sabe isso é o advogado que está com o documento na mão.
 */
const schema = z.object({
  tipo: z.enum(["multa", "indeferimento", "notificacao_saida", "outro"]),
  // "" vira null: um campo esvaziado na tela é uma correção, não um valor.
  notificacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).nullish(),
  limite: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).nullish(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let dados: z.infer<typeof schema>;
  try {
    dados = schema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "Confira o tipo do prazo e as datas (dd/mm/aaaa)." },
      { status: 400 },
    );
  }

  const notificacao = dados.notificacao || null;
  const limite = dados.limite || null;

  // A data limite não pode ser anterior à notificação: isso é erro de digitação, e um
  // erro de digitação aqui vira um contador regressivo errado na fila de todo mundo.
  if (notificacao && limite && limite < notificacao) {
    return NextResponse.json(
      { error: "A data limite não pode ser anterior à data da notificação." },
      { status: 400 },
    );
  }

  try {
    const lead = await getRepository().confirmarPrazo(
      params.id,
      { tipo: dados.tipo, notificacao, limite },
      auth.session.email,
    );
    await registrarAcesso(
      auth.session,
      "confirmou_prazo",
      { tipo: "lead", id: params.id, detalhe: `${dados.tipo} · limite ${limite ?? "—"}` },
      req,
    );
    return NextResponse.json({ ok: true, lead });
  } catch (err) {
    console.error("[leads/prazo:POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível confirmar o prazo." }, { status: 400 });
  }
}
