import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { MOTIVOS_DE_PERDA, type MotivoPerda } from "@/lib/domain/types";

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
//
// PROPOR é a etapa comercial: o orçamento saiu e está com o cliente. Ela grava data,
// valor, serviço e validade — e é a única ação do quadro que exige mais do que um clique,
// porque uma coluna de propostas em que não se sabe de quanto é cada uma não responde a
// pergunta que ela existe para responder.
const proposta = z.object({
  /** ISO. Ausente = agora; a tela deixa corrigir para o dia em que o orçamento saiu mesmo. */
  propostaEnviadaEm: z.string().datetime().optional(),
  propostaValor: z.number().nonnegative().max(100_000_000).optional(),
  propostaServico: z.string().trim().min(2).max(200),
  /** YYYY-MM-DD. Proposta sem validade é proposta que nunca vence — e nunca é cobrada. */
  propostaValidade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const schema = z.object({
  acao: z.enum([
    "assumir",
    "responsaveis",
    "propor",
    "agendar",
    "fechar",
    "perder",
    "reabrir",
    "mover",
  ]),
  motivo: z.string().max(500).optional(),
  /** A categoria da perda. Texto livre não se soma; ver MotivoPerda em lib/domain/types.ts. */
  motivoPerdaCategoria: z.enum(MOTIVOS_DE_PERDA as [string, ...string[]]).optional(),
  responsavelId: z.string().nullish(),
  /** Só para `responsaveis`: quem MAIS está no caso, além do dono. */
  apoioIds: z.array(z.string()).max(10).optional(),
  /** Só para `reabrir`: para onde o caso volta. */
  para: z.enum(["novo", "em_atendimento", "proposta_enviada", "agendado"]).optional(),
  /** Só para `propor`. */
  proposta: proposta.optional(),
  /** Só para `fechar`: quanto foi efetivamente contratado, em reais. */
  valorContratado: z.number().nonnegative().max(100_000_000).optional(),
  /** Só para `fechar`: o caso se resolveu sem contrato. É o oposto de "esqueci de preencher". */
  semValor: z.boolean().optional(),
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

  if (input.acao === "perder") {
    if (!input.motivoPerdaCategoria) {
      return NextResponse.json(
        { error: "Escolha o motivo da perda — sem categoria, nenhum relatório soma este caso." },
        { status: 400 },
      );
    }
    if (!input.motivo?.trim()) {
      return NextResponse.json(
        { error: "Diga por que este caso foi perdido — é o que se lê daqui a seis meses." },
        { status: 400 },
      );
    }
  }

  if (input.acao === "propor" && !input.proposta) {
    return NextResponse.json(
      { error: "Diga qual serviço foi orçado e até quando a proposta vale." },
      { status: 400 },
    );
  }

  // FECHAR SEM DIZER QUANTO É O ERRO CARO AQUI. Um campo em branco não distingue "fechou
  // sem contrato" de "esqueceram de preencher", e a soma do mês fica errada em silêncio.
  if (input.acao === "fechar" && input.valorContratado === undefined && !input.semValor) {
    return NextResponse.json(
      { error: "Diga quanto foi contratado — ou marque que este caso fechou sem contrato." },
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

    // PROPOSTA ENVIADA. O `assumir` implícito não acontece aqui de propósito: quem manda
    // orçamento já assumiu o caso antes, e reatribuir o responsável no meio de uma
    // negociação tiraria o caso das mãos de quem está negociando.
    if (input.acao === "propor") {
      const p = input.proposta!;
      if (etapa && etapa.status !== "proposta_enviada") {
        return NextResponse.json(
          { error: "Esta etapa não corresponde mais a essa ação. Recarregue o quadro." },
          { status: 409 },
        );
      }
      const lead = await repo.updateLead(params.id, {
        atendimentoStatus: "proposta_enviada",
        propostaEnviadaEm: p.propostaEnviadaEm ?? new Date().toISOString(),
        propostaValor: p.propostaValor ?? null,
        propostaServico: p.propostaServico.trim(),
        propostaValidade: p.propostaValidade,
        ...noQuadro,
      });
      await registrarAcesso(
        auth.session,
        "enviou_proposta",
        {
          tipo: "lead",
          id: params.id,
          detalhe: `${p.propostaServico.trim()}${p.propostaValor != null ? ` · R$ ${p.propostaValor.toFixed(2)}` : " · sem valor"} · vale até ${p.propostaValidade}`,
        },
        req,
      );
      return NextResponse.json({ ok: true, lead });
    }

    // TROCAR O DONO E DIZER QUEM MAIS ESTÁ NO CASO.
    //
    // Passa por `assumirLead` e não por um update solto: é ele que sabe que `assumidoEm`
    // marca o PRIMEIRO a assumir e nunca é reescrito — uma troca de responsável amanhã
    // não pode reiniciar o "tempo até o primeiro contato humano" — e que um caso ainda
    // "novo" vira "em atendimento" ao ganhar dono.
    if (input.acao === "responsaveis") {
      const atual = await repo.getLead(params.id);
      if (!atual) {
        return NextResponse.json({ error: "Este caso não existe mais." }, { status: 404 });
      }
      const dono = input.responsavelId ?? null;
      const apoio = (input.apoioIds ?? []).filter((u) => u && u !== dono);
      if (new Set(apoio).size !== apoio.length) {
        return NextResponse.json({ error: "A mesma pessoa apareceu duas vezes no apoio." }, { status: 400 });
      }

      const usuarios = await repo.listUsers().catch(() => []);
      const conhecidos = new Set(usuarios.map((u) => u.id));
      for (const u of [dono, ...apoio]) {
        if (u && !conhecidos.has(u)) {
          return NextResponse.json({ error: "Esta pessoa não está mais no time." }, { status: 400 });
        }
      }

      let lead = atual;
      if (dono !== (atual.responsavelId ?? null)) {
        lead = await repo.assumirLead(params.id, dono, auth.session.email);
        // O AGENTE SEGUE O DONO. Sem isto, transferir o caso deixava a conversa calada em
        // nome de quem transferiu — e a Ana voltava a falar por cima de quem assumiu, ou
        // não voltava nunca, dependendo de quem clicou.
        const novoDono = usuarios.find((u) => u.id === dono);
        if (novoDono?.email) {
          await repo
            .assumeConversation(lead.conversationId, novoDono.email)
            .catch((e) => console.error("[atendimento] não movi o agente para o novo dono:", e instanceof Error ? e.message : e));
        }
      }
      lead = await repo.updateLead(params.id, { apoioIds: apoio });

      const nome = (uid: string | null) =>
        usuarios.find((u) => u.id === uid)?.name || usuarios.find((u) => u.id === uid)?.email || "ninguém";
      await registrarAcesso(
        auth.session,
        "mudou_responsaveis",
        {
          tipo: "lead",
          id: params.id,
          detalhe: `dono: ${nome(dono)}${apoio.length ? ` · apoio: ${apoio.map(nome).join(", ")}` : ""}`,
        },
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
      motivoPerdaCategoria:
        input.acao === "perder" ? (input.motivoPerdaCategoria as MotivoPerda) : undefined,
      // `null` explícito quando fechou sem contrato: é um valor gravado, não um campo em
      // branco — a diferença é o que separa "não houve" de "ninguém preencheu".
      valorContratado:
        input.acao === "fechar" ? (input.semValor ? null : input.valorContratado) : undefined,
      ...noQuadro,
    });
    await registrarAcesso(
      auth.session,
      input.acao === "reabrir" ? `reabriu_para_${status}` : `marcou_${status}`,
      {
        tipo: "lead",
        id: params.id,
        detalhe:
          input.acao === "perder"
            ? [input.motivoPerdaCategoria, input.motivo?.trim()].filter(Boolean).join(" · ")
            : input.acao === "fechar"
              ? input.semValor
                ? "fechado sem contrato"
                : `contratado R$ ${(input.valorContratado ?? 0).toFixed(2)}`
              : input.motivo?.trim(),
      },
      req,
    );
    return NextResponse.json({ ok: true, lead });
  } catch (err) {
    console.error("[leads/atendimento:POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível atualizar o atendimento." }, { status: 400 });
  }
}
