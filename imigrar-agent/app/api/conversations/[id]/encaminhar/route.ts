import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { env } from "@/lib/env";
import { sendMessage } from "@/lib/whatsapp/send";
import { etapaAoTrocarDeFunil } from "@/lib/crm/funil";
import { ambienteDaConversa, contaComoOperacaoReal } from "@/lib/domain/ambiente";
import { eConversaDeGrupo } from "@/lib/whatsapp/remetente";
import { eFiltrada, type AtendimentoStatus, type EtapaCrm } from "@/lib/domain/types";
import { ATENDIMENTO_LABEL } from "@/lib/domain/rotulos";
import { primeiroNome } from "@/lib/auth/nomes";
import { MODOS_DA_AGENTE, agenteCalada, aplicarAgente, fraseDaAgente } from "@/lib/crm/agente-na-transferencia";

export const dynamic = "force-dynamic";

/**
 * OS DOIS GESTOS DA LISTA DE CONVERSAS: passar a conversa para alguém do time, e mandar
 * o contato para um funil do CRM.
 *
 * Os dois já existiam — mas só de dentro do caso: era preciso abrir a conversa, achar o
 * lead, abrir a ficha e trocar o responsável lá. Quem está triando a lista quer fazer
 * isso na linha, sem perder o lugar.
 *
 * NENHUM DOS DOIS INVENTA REGRA. Transferir é o mesmo "trocar o dono" da ficha
 * (`assumirLead` + a agente para ou continua, à escolha de quem transfere); mandar ao funil usa a mesma
 * `etapaAoTrocarDeFunil` do quadro. O que esta rota acrescenta é só o que faltava para
 * funcionar a partir de uma conversa: criar o lead quando ele ainda não existe.
 *
 * É de qualquer pessoa logada, como as ações da ficha — não é privilégio de admin.
 */

/** O que os dois diálogos precisam para abrir: o time, os funis e como este contato está. */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const repo = getRepository();
  const [usuarios, funis, etapas, lead, conv] = await Promise.all([
    repo.listUsers().catch(() => []),
    repo.listFunis().catch(() => []),
    repo.listEtapas().catch(() => []),
    repo.getLeadByConversation(params.id).catch(() => null),
    repo.getConversation(params.id).catch(() => null),
  ]);

  return NextResponse.json({
    // O diálogo diz "continua" ou "volta a responder" conforme ela esteja falando ou não.
    agenteCalada: agenteCalada(conv),
    // Só id e nome: a lista de usuários é dado de funcionário, e para escolher um nome
    // num seletor não é preciso e-mail, papel nem setor.
    pessoas: usuarios
      .filter((u) => u.active !== false)
      .map((u) => ({ id: u.id, nome: u.name?.trim() || u.email, eu: u.id === auth.session.sub }))
      .sort((a, b) => Number(b.eu) - Number(a.eu) || a.nome.localeCompare(b.nome, "pt-BR")),
    funis: funis
      .filter((f) => !f.arquivado)
      .sort((a, b) => a.ordem - b.ordem)
      .map((f) => ({ id: f.id, nome: f.nome, padrao: f.padrao })),
    // As etapas de todos os funis: o diálogo mostra as do funil escolhido. O `status` vai
    // junto porque é ele que diz quais etapas dá para escolher daqui (ver o POST).
    etapas: etapas
      .filter((e) => !e.arquivada)
      .sort((a, b) => a.ordem - b.ordem)
      .map((e) => ({ id: e.id, funilId: e.funilId, nome: e.nome, status: e.status })),
    lead: lead
      ? {
          id: lead.id,
          responsavelId: lead.responsavelId ?? null,
          funilId: lead.funilId ?? null,
          etapaId: lead.etapaId ?? null,
          status: lead.atendimentoStatus ?? "novo",
        }
      : null,
  });
}

const schema = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("transferir"),
    usuarioId: z.string().min(1),
    /** Sem a escolha, a agente para — como sempre foi. */
    agente: z.enum(MODOS_DA_AGENTE).default("para"),
  }),
  z.object({
    acao: z.literal("crm"),
    funilId: z.string().min(1),
    /** Sem etapa, o caso entra na que corresponde à situação dele (a regra do quadro). */
    etapaId: z.string().min(1).nullish(),
    /** Sem responsável, o dono do caso fica como está. */
    responsavelId: z.string().min(1).nullish(),
    agente: z.enum(MODOS_DA_AGENTE).default("para"),
  }),
]);

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  const repo = getRepository();
  const conv = await repo.getConversation(params.id);
  if (!conv) {
    return NextResponse.json({ error: "Esta conversa não existe mais. Atualize a lista." }, { status: 404 });
  }

  try {
    if (input.acao === "transferir") {
      const usuarios = await repo.listUsers();
      const destino = usuarios.find((u) => u.id === input.usuarioId && u.active !== false);
      if (!destino) {
        return NextResponse.json({ error: "Esta pessoa não está mais no time." }, { status: 400 });
      }
      const nome = destino.name?.trim() || destino.email;

      if (eConversaDeGrupo(conv.whatsappNumber)) {
        return NextResponse.json({ error: "Esta é uma conversa de grupo — não tem um caso para transferir." }, { status: 400 });
      }
      // JÁ ESTÁ COM ESSA PESSOA: nada muda, e ninguém precisa ser avisado de novo. O
      // diálogo abre com o dono atual marcado, e confirmar sem trocar reenviava o aviso
      // de "conversa transferida" ao WhatsApp do time.
      const leadAtual = await repo.getLeadByConversation(conv.id);
      const nadaMuda =
        input.agente === "para" ? conv.assumedBy === destino.email : !agenteCalada(conv);
      if (leadAtual?.responsavelId === destino.id && nadaMuda) {
        return NextResponse.json({ ok: true, leadId: leadAtual.id, mensagem: `A conversa já está com ${nome}.` });
      }

      // Conversa sem lead (quem só mandou "oi") ganha um agora: é no lead que mora o dono
      // do caso, e é ele que faz a conversa aparecer em "Meus" para quem recebeu.
      const lead =
        leadAtual ??
        (await repo.upsertLead(conv.id, conv.contactName ? { contactName: conv.contactName } : {}));

      await repo.assumirLead(lead.id, destino.id, auth.session.email);
      await aplicarAgente(repo, conv.id, { email: destino.email, nome }, input.agente, "Transferência manual pelo painel.");

      await registrarAcesso(
        auth.session,
        "transferiu_conversa",
        { tipo: "lead", id: lead.id, detalhe: `para ${nome} · agente ${input.agente} · conversa ${conv.id}` },
        req,
      );

      // O SINO. Transferir pela lista não abria ticket, e quem recebia não era avisado no
      // painel. Para si mesmo não abre: ninguém precisa ser avisado do que acabou de fazer.
      if (destino.id !== auth.session.sub && contaComoOperacaoReal(ambienteDaConversa(conv))) {
        await repo
          .createTransferTicket({
            conversationId: conv.id,
            clienteId: conv.clienteId,
            reason: `manual:${nome}`,
            priority: "normal",
            dossie: { nome: lead.contactName ?? conv.contactName ?? undefined, para: nome, necessidade: `Transferida para ${nome}.` },
          })
          .catch((e) => console.error("[encaminhar] não abri o ticket:", e instanceof Error ? e.message : e));
      }

      // O aviso no WhatsApp do time, como na transferência de dentro da conversa. Quem
      // transferiu para si mesmo não precisa ser avisado do que acabou de fazer.
      if (env.teamWhatsapp && destino.id !== auth.session.sub && contaComoOperacaoReal(ambienteDaConversa(conv))) {
        const contato = conv.contactName ?? conv.whatsappNumber;
        await sendMessage(
          env.teamWhatsapp,
          `🔔 *Conversa transferida*\n${contato} agora está com ${primeiroNome(nome)}.\nAbrir: ${env.appUrl}/dashboard/conversations/${conv.id}`,
        ).catch((e) => console.error("[encaminhar] falha ao avisar o time:", e instanceof Error ? e.message : e));
      }

      return NextResponse.json({ ok: true, leadId: lead.id, mensagem: `Conversa transferida para ${nome}. ${fraseDaAgente(input.agente)}` });
    }

    // ─── MANDAR AO FUNIL DO CRM ───

    // O QUADRO NÃO MOSTRA ESTES TRÊS, então dizer "enviado" seria mentir: o card nunca
    // apareceria. Melhor recusar com o motivo do que criar um caso invisível.
    if (!contaComoOperacaoReal(ambienteDaConversa(conv))) {
      return NextResponse.json({ error: "Esta é uma conversa de ensaio — ensaio não entra no CRM." }, { status: 400 });
    }
    if (eConversaDeGrupo(conv.whatsappNumber)) {
      return NextResponse.json({ error: "Esta é uma conversa de grupo — grupo não vira caso no CRM." }, { status: 400 });
    }

    const [funis, etapas] = await Promise.all([repo.listFunis(), repo.listEtapas()]);
    const funil = funis.find((f) => f.id === input.funilId && !f.arquivado);
    if (!funil) {
      return NextResponse.json({ error: "Este funil não existe mais. Feche e abra de novo." }, { status: 400 });
    }

    const existente = await repo.getLeadByConversation(conv.id);
    if (existente && eFiltrada(existente.classificacao)) {
      return NextResponse.json(
        {
          error: `Este contato está filtrado (${existente.classificacao}) e não aparece no CRM. Resgate-o na aba Filtradas primeiro.`,
        },
        { status: 409 },
      );
    }
    // ─── TUDO É CONFERIDO ANTES DE GRAVAR QUALQUER COISA ───
    //
    // São três escolhas (funil, etapa, responsável) e uma depende da outra: dar dono a um
    // caso novo o põe "em atendimento", e a etapa precisa combinar com isso. Recusar no
    // meio deixaria o caso com dono novo e na etapa antiga.

    let destino: { id: string; email: string; nome: string } | null = null;
    if (input.responsavelId && input.responsavelId !== (existente?.responsavelId ?? null)) {
      const u = (await repo.listUsers()).find((x) => x.id === input.responsavelId && x.active !== false);
      if (!u) return NextResponse.json({ error: "Esta pessoa não está mais no time." }, { status: 400 });
      destino = { id: u.id, email: u.email, nome: u.name?.trim() || u.email };
    }

    const statusAntes: AtendimentoStatus = existente?.atendimentoStatus ?? "novo";
    // `assumirLead` faz exatamente isto: caso novo que ganha dono passa a em atendimento.
    const statusComDono: AtendimentoStatus = destino && statusAntes === "novo" ? "em_atendimento" : statusAntes;

    let etapa: EtapaCrm | null;
    let statusFinal = statusComDono;
    if (input.etapaId) {
      etapa = etapas.find((e) => e.id === input.etapaId && e.funilId === funil.id && !e.arquivada) ?? null;
      if (!etapa) {
        return NextResponse.json({ error: "Esta etapa não existe mais neste funil. Feche e abra de novo." }, { status: 400 });
      }
      if (etapa.status !== statusComDono) {
        const temDono = Boolean(destino ?? existente?.responsavelId);
        if (etapa.status === "em_atendimento" && statusComDono === "novo") {
          return NextResponse.json(
            { error: `A etapa "${etapa.nome}" é de caso que alguém já pegou. Escolha o responsável.` },
            { status: 400 },
          );
        }
        if (etapa.status === "novo" && statusAntes === "novo" && destino) {
          return NextResponse.json(
            { error: `A etapa "${etapa.nome}" é de caso que ninguém pegou ainda. Deixe sem responsável ou escolha outra etapa.` },
            { status: 400 },
          );
        }
        // AGENDAR é a única mudança de situação que não pede mais nada. Proposta pede
        // serviço e validade, fechar pede valor, perder pede motivo, e reabrir é decisão
        // que se toma olhando o caso: essas continuam no quadro, onde há a pergunta.
        const podeAgendar =
          etapa.status === "agendado" && (statusComDono === "em_atendimento" || statusComDono === "proposta_enviada") && temDono;
        if (!podeAgendar) {
          return NextResponse.json(
            {
              error: `A etapa "${etapa.nome}" muda a situação do caso (de "${ATENDIMENTO_LABEL[statusComDono]}" para "${ATENDIMENTO_LABEL[etapa.status]}"), e isso é feito no quadro do CRM. Escolha outra etapa aqui e mova o card por lá.`,
            },
            { status: 409 },
          );
        }
        statusFinal = "agendado";
      }
    } else {
      etapa = etapaAoTrocarDeFunil(statusComDono, funil.id, etapas);
      if (!etapa) {
        return NextResponse.json(
          {
            error: `Este caso já está encerrado, e o funil "${funil.nome}" não tem etapa para caso encerrado. Reabra o caso no CRM antes de movê-lo.`,
          },
          { status: 409 },
        );
      }
      // A AUTOMÁTICA SEGUE A MESMA REGRA DA ESCOLHA À MÃO. Sem etapa com a situação do
      // caso, `etapaAoTrocarDeFunil` cai na primeira do funil — e um caso em atendimento
      // ia parar na coluna de "novo", ou um caso aberto numa coluna de contrato fechado,
      // com o quadro e a fila contando coisas diferentes.
      if (etapa.status !== statusComDono) {
        return NextResponse.json(
          {
            error: `O funil "${funil.nome}" não tem etapa para caso "${ATENDIMENTO_LABEL[statusComDono]}". Escolha a etapa à mão ou outro funil.`,
          },
          { status: 409 },
        );
      }
    }

    // ─── AGORA GRAVA ───

    const lead =
      existente ??
      (await repo.upsertLead(conv.id, conv.contactName ? { contactName: conv.contactName } : {}));

    if (destino) {
      await repo.assumirLead(lead.id, destino.id, auth.session.email);
      await aplicarAgente(repo, conv.id, destino, input.agente, "Responsável definido ao enviar ao CRM.");
    }

    const mudouDeLugar = lead.funilId !== funil.id || lead.etapaId !== etapa.id;
    if (mudouDeLugar || statusFinal !== statusComDono) {
      await repo.updateLead(lead.id, {
        funilId: funil.id,
        etapaId: etapa.id,
        ...(statusFinal !== statusComDono ? { atendimentoStatus: statusFinal } : {}),
      });
    }
    await registrarAcesso(
      auth.session,
      "enviou_ao_crm",
      {
        tipo: "lead",
        id: lead.id,
        detalhe: `${funil.nome} · ${etapa.nome}${destino ? ` · responsável: ${destino.nome}` : ""}${existente ? "" : " · lead criado"}`,
      },
      req,
    );

    const onde = `no funil "${funil.nome}", na etapa "${etapa.nome}"`;
    return NextResponse.json({
      ok: true,
      leadId: lead.id,
      criado: !existente,
      responsavelNome: destino?.nome ?? null,
      mensagem:
        (!mudouDeLugar && !destino
          ? `Este contato já estava ${onde}.`
          : `${existente ? "Lead" : "Lead criado e"} ${mudouDeLugar ? "enviado" : "mantido"} ${onde}.`) +
        (destino ? ` Responsável: ${destino.nome}. ${fraseDaAgente(input.agente)}` : ""),
    });
  } catch (err) {
    console.error("[conversations/encaminhar:POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível concluir. Tente de novo em instantes." }, { status: 500 });
  }
}
