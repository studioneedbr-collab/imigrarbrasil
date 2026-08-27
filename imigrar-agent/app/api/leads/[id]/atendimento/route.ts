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
//
// MOVER é a ação do CRM: o card mudou de ETAPA sem mudar de status ("em atendimento" →
// "aguardando certidão consular" continua sendo em atendimento). Ela entra AQUI, e não
// num endpoint próprio, pelo mesmo motivo que o arrasto sempre entrou: um segundo caminho
// de escrita para o mesmo card é a forma mais rápida de perder o registro no log de
// acesso e de deixar a etapa e o status contando histórias diferentes.
const schema = z.object({
  acao: z.enum(["assumir", "agendar", "fechar", "perder", "reabrir", "mover"]),
  motivo: z.string().max(500).optional(),
  responsavelId: z.string().nullish(),
  /** Só para `reabrir`: para onde o caso volta. */
  para: z.enum(["novo", "em_atendimento", "agendado"]).optional(),
  /** Onde o card foi solto no quadro do CRM. Ver lib/crm/funil.ts. */
  etapaId: z.string().nullish(),
  funilId: z.string().nullish(),
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

  // A ETAPA PRECISA DESCREVER O STATUS QUE ELA APLICA.
  //
  // O quadro traduz "soltar nesta coluna" em uma destas ações lendo `etapa.status`. Se a
  // etapa tiver sido editada por outra pessoa no meio do caminho, o cliente estaria
  // pedindo "fechar" e gravando o card numa coluna de "em atendimento" — as duas coisas
  // ficariam gravadas, contando histórias diferentes. Aqui o servidor confere de novo.
  //
  // BANCO SEM A MIGRATION 026: o quadro abre com o funil padrão que vive em código, e as
  // etapas que ele manda aqui não existem em tabela nenhuma. Nesse caso a etapa é
  // IGNORADA — gravar um `etapa_id` inventado quebraria a chave estrangeira, e recusar o
  // movimento faria o painel parar de mover card por causa de uma coluna que ainda não
  // subiu. O status, que é o que importa, continua sendo gravado.
  const etapasNoBanco = await repo.listEtapas().catch(() => []);
  const temCrm = etapasNoBanco.length > 0;
  let etapa = null;
  if (input.etapaId && temCrm) {
    etapa = etapasNoBanco.find((e) => e.id === input.etapaId) ?? null;
    if (!etapa) {
      return NextResponse.json({ error: "Esta etapa não existe mais. Recarregue o quadro." }, { status: 400 });
    }
  }
  const noQuadro = etapa ? { funilId: etapa.funilId, etapaId: etapa.id } : {};

  try {
    // MOVER: só a etapa muda. O status do domínio fica exatamente onde estava.
    if (input.acao === "mover") {
      if (!etapa) {
        return NextResponse.json(
          {
            error: temCrm
              ? "Diga para qual etapa o caso vai."
              : "O CRM ainda não foi criado neste banco — rode a migration 026 para usar etapas.",
          },
          { status: 400 },
        );
      }
      const atual = await repo.getLead(params.id);
      if (etapa.status !== (atual?.atendimentoStatus ?? "novo")) {
        return NextResponse.json(
          { error: "Esta etapa muda o status do atendimento — recarregue o quadro e tente de novo." },
          { status: 409 },
        );
      }
      const lead = await repo.updateLead(params.id, noQuadro);
      await registrarAcesso(
        auth.session,
        "moveu_etapa",
        { tipo: "lead", id: params.id, detalhe: `${etapa.nome} (${etapa.status})` },
        req,
      );
      return NextResponse.json({ ok: true, lead });
    }

    if (input.acao === "assumir") {
      const lead = await repo.assumirLead(
        params.id,
        input.responsavelId ?? auth.session.sub,
        auth.session.email,
      );
      // NÍVEL 3 — ASSUMIR O ATENDIMENTO CALA O AGENTE NAQUELA CONVERSA.
      //
      // Sem isto, humano e agente respondem juntos na mesma thread: a pessoa pega o caso
      // na fila, liga, e enquanto ela escreve a Ana já respondeu outra coisa. Assumir o
      // lead e assumir a conversa eram dois gestos separados, e o segundo era esquecido
      // exatamente quando o caso era urgente o bastante para alguém correr para ele.
      // A etapa entra depois do assumir: `assumirLead` é a ação do domínio (grava
      // responsável, marca o relógio) e não sabe nada de quadro.
      const comEtapa = etapa ? await repo.updateLead(params.id, noQuadro) : lead;
      await repo
        .assumeConversation(lead.conversationId, auth.session.email)
        .catch((e) => console.error("[atendimento] não calei o agente na conversa:", e instanceof Error ? e.message : e));
      await registrarAcesso(
        auth.session,
        "assumiu_atendimento",
        { tipo: "lead", id: params.id, detalhe: `agente calado na conversa ${lead.conversationId}` },
        req,
      );
      return NextResponse.json({ ok: true, lead: comEtapa });
    }

    const status =
      input.acao === "agendar"
        ? "agendado"
        : input.acao === "fechar"
          ? "fechado"
          : input.acao === "reabrir"
            ? (input.para ?? "em_atendimento")
            : "perdido";
    if (etapa && etapa.status !== status) {
      return NextResponse.json(
        { error: "Esta etapa não corresponde mais a essa ação. Recarregue o quadro." },
        { status: 409 },
      );
    }
    const lead = await repo.updateLead(params.id, {
      atendimentoStatus: status,
      motivoPerda: input.acao === "perder" ? input.motivo?.trim() : undefined,
      ...noQuadro,
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
