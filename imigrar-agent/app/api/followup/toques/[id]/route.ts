import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { sendMessage } from "@/lib/whatsapp/send";
import { ehEnsaio } from "@/lib/domain/ambiente";
import { decidir } from "@/lib/followup/regras";
import { proximoToqueSugerido, type MotivoEspera } from "@/lib/followup/motivos";

export const dynamic = "force-dynamic";

// ENVIAR, EDITAR OU PULAR — a decisão humana sobre o rascunho.
//
// PULAR NÃO É FALHA, É DADO. Um modelo que é pulado toda vez está errado, e a única forma
// de descobrir isso é registrar o pulo em vez de simplesmente sumir com o rascunho.
//
// EDITAR grava o texto que SAIU, não o do modelo. O par (o que o sistema escreveu, o que a
// pessoa mandou) é o que mostra onde o modelo erra — some se só o texto final for guardado.
const schema = z.object({
  acao: z.enum(["enviar", "pular", "concluir"]),
  /** O texto editado. Ausente = manda como está. */
  texto: z.string().trim().min(1).max(1200).optional(),
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

  const repo = getRepository();
  const pendentes = await repo.listToquesPendentes().catch(() => []);
  const toque = pendentes.find((t) => t.id === params.id);
  if (!toque) {
    return NextResponse.json(
      { error: "Este rascunho não está mais na fila — alguém já decidiu, ou a pessoa respondeu." },
      { status: 409 },
    );
  }

  // CONCLUIR é da TAREFA: alguém ligou, alguém escreveu à mão. É estado diferente de
  // "pulado" porque responde outra pergunta — pular fala do modelo, concluir fala do
  // trabalho — e somar os dois apagaria as duas leituras.
  if (input.acao === "concluir") {
    if (toque.status !== "tarefa") {
      return NextResponse.json({ error: "Isto não é uma tarefa." }, { status: 400 });
    }
    await repo.atualizarToque(toque.id, { status: "feito", aprovadoPor: auth.session.email });
    await registrarAcesso(
      auth.session,
      "concluiu_tarefa_followup",
      { tipo: "followup_toque", id: toque.id, detalhe: toque.canal },
      req,
    );
    return NextResponse.json({ ok: true });
  }

  if (toque.status !== "rascunho") {
    return NextResponse.json(
      { error: "Este item é uma tarefa — marque como feita em vez de enviar." },
      { status: 400 },
    );
  }

  if (input.acao === "pular") {
    await repo.atualizarToque(toque.id, { status: "pulado", aprovadoPor: auth.session.email });
    // Pular não tira o caso da régua: a espera continua, e o próximo toque nasce na data
    // seguinte da cadência. O que morreu foi ESTA frase, não o acompanhamento.
    if (toque.leadId) {
      const lead = await repo.getLead(toque.leadId).catch(() => null);
      const motivo = lead?.esperaMotivo as MotivoEspera | undefined;
      const proximo = motivo ? proximoToqueSugerido(motivo) : null;
      if (lead && proximo) {
        await repo.updateLead(lead.id, { proximoToqueEm: proximo.toISOString() }).catch(() => {});
      }
    }
    await registrarAcesso(
      auth.session,
      "pulou_followup",
      { tipo: "followup_toque", id: toque.id, detalhe: toque.motivo },
      req,
    );
    return NextResponse.json({ ok: true });
  }

  // ─── ENVIAR ───
  //
  // As travas são conferidas DE NOVO aqui, e não só no cron que escreveu o rascunho. Entre
  // uma coisa e outra passam horas: a pessoa pode ter pedido para parar, o caso pode ter
  // sido fechado, e um rascunho aprovado às pressas não pode ser a porta dos fundos por
  // onde a mensagem sai mesmo assim.
  const conv = await repo.getConversation(toque.conversationId);
  if (!conv?.whatsappNumber) {
    await repo.atualizarToque(toque.id, { status: "cancelado" });
    return NextResponse.json({ error: "Esta conversa não existe mais." }, { status: 409 });
  }
  const lead = toque.leadId ? await repo.getLead(toque.leadId).catch(() => null) : null;

  const decisao = decidir(
    {
      motivo: (lead?.esperaMotivo as MotivoEspera | null) ?? (toque.motivo as MotivoEspera),
      // A janela e a data já foram respeitadas quando o rascunho nasceu, e quem está
      // aprovando está na tela agora: o que se reconfere aqui é o que PROÍBE, não o que
      // agenda. Por isso a data entra como vencida.
      proximoToqueEm: new Date(0).toISOString(),
      toquesNoMotivo: lead?.toquesNoMotivo ?? 0,
      jaRespondeuAlguma: true,
      temPrazoProcessual: Boolean(lead?.temPrazoCorrendo || lead?.prazoDataLimite),
      perfilDpu: lead?.classificacao === "DPU",
      ensaio: ehEnsaio(conv.whatsappNumber) || conv.ambiente === "teste",
      encerrado: lead?.atendimentoStatus === "fechado" || lead?.atendimentoStatus === "perdido",
      optOutAt: conv.optOutAt ?? null,
      noFollowupAt: conv.noFollowupAt ?? null,
      temModeloNoIdioma: true,
      envioDoModelo: "rascunho",
    },
    { enviadosHoje: 0, tetoDiario: Number.MAX_SAFE_INTEGER },
  );

  if (decisao.tipo === "bloqueado") {
    await repo.atualizarToque(toque.id, { status: "cancelado" });
    return NextResponse.json(
      {
        error:
          decisao.porque === "opt_out"
            ? "Este contato pediu para não receber mais mensagens. O rascunho foi cancelado."
            : "Este caso saiu da régua de follow-up. O rascunho foi cancelado.",
      },
      { status: 409 },
    );
  }
  if (decisao.tipo === "tarefa_ligar") {
    await repo.atualizarToque(toque.id, { status: "tarefa" });
    return NextResponse.json(
      { error: "Há prazo processual correndo aqui. Isto se resolve com uma ligação, não com mensagem." },
      { status: 409 },
    );
  }

  const texto = input.texto?.trim() || toque.texto;
  try {
    await sendMessage(conv.whatsappNumber, texto);
  } catch (err) {
    console.error("[followup/toque] falha ao enviar", toque.id, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não consegui enviar. Nada foi alterado." }, { status: 502 });
  }
  await repo.addMessage(conv.id, "assistant", texto);
  await repo.atualizarToque(toque.id, {
    status: "enviado",
    // O texto gravado é o que SAIU. Se alguém editou, é a edição que a pessoa recebeu — e
    // é a edição que precisa aparecer na linha do tempo seis meses depois.
    texto,
    aprovadoPor: auth.session.email,
    enviadoEm: new Date().toISOString(),
  });

  if (lead) {
    const motivo = lead.esperaMotivo as MotivoEspera | null;
    const proximo = motivo ? proximoToqueSugerido(motivo) : null;
    await repo
      .updateLead(lead.id, {
        toquesNoMotivo: (lead.toquesNoMotivo ?? 0) + 1,
        proximoToqueEm: proximo ? proximo.toISOString() : null,
      })
      .catch(() => {});
  }

  await registrarAcesso(
    auth.session,
    "enviou_followup",
    {
      tipo: "followup_toque",
      id: toque.id,
      detalhe: `${toque.motivo} · ${toque.idioma ?? "idioma não identificado"}${
        input.texto && input.texto.trim() !== toque.texto ? " · editado antes de enviar" : ""
      }`,
    },
    req,
  );
  return NextResponse.json({ ok: true });
}
