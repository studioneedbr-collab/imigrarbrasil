import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";

export const dynamic = "force-dynamic";

// ASSUMIR, AGENDAR, FECHAR, PERDER, REABRIR.
//
// "Perdido" exige motivo. Sem isso a coluna vira um cemitério sem explicação, e a
// pergunta que interessa — por que este caso não virou atendimento? — não tem resposta
// seis meses depois.
//
// REABRIR existe por causa do kanban: quando o status vira coisa que se arrasta, o
// arrasto errado deixa de ser hipótese. Sem um caminho de volta, fechar um caso por
// engano exigiria mexer no banco. Ela NÃO reatribui responsável — quem arrastou o card
// não é necessariamente quem cuida do caso — e é auditada como todas as outras.
const schema = z.object({
  acao: z.enum(["assumir", "agendar", "fechar", "perder", "reabrir"]),
  motivo: z.string().max(500).optional(),
  responsavelId: z.string().nullish(),
  /** Só para `reabrir`: para onde o caso volta. */
  para: z.enum(["novo", "em_atendimento", "agendado"]).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  if (input.acao === "perder" && !input.motivo?.trim()) {
    return NextResponse.json(
      { error: "Diga por que este caso foi perdido — é o que se lê daqui a seis meses." },
      { status: 400 },
    );
  }

  const repo = getRepository();
  try {
    if (input.acao === "assumir") {
      const lead = await repo.assumirLead(
        params.id,
        input.responsavelId ?? auth.session.sub,
        auth.session.email,
      );
      await registrarAcesso(auth.session, "assumiu_atendimento", { tipo: "lead", id: params.id }, req);
      return NextResponse.json({ ok: true, lead });
    }

    const status =
      input.acao === "agendar"
        ? "agendado"
        : input.acao === "fechar"
          ? "fechado"
          : input.acao === "reabrir"
            ? (input.para ?? "em_atendimento")
            : "perdido";
    const lead = await repo.updateLead(params.id, {
      atendimentoStatus: status,
      motivoPerda: input.acao === "perder" ? input.motivo?.trim() : undefined,
    });
    await registrarAcesso(
      auth.session,
      input.acao === "reabrir" ? `reabriu_para_${status}` : `marcou_${status}`,
      { tipo: "lead", id: params.id, detalhe: input.motivo?.trim() },
      req,
    );
    return NextResponse.json({ ok: true, lead });
  } catch (err) {
    console.error("[leads/atendimento:POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível atualizar o atendimento." }, { status: 400 });
  }
}
