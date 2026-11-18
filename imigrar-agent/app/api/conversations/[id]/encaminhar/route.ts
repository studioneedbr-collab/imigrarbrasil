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
import { eFiltrada } from "@/lib/domain/types";
import { primeiroNome } from "@/lib/auth/nomes";

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
 * (`assumirLead` + calar a agente na conversa); mandar ao funil usa a mesma
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
  const [usuarios, funis, lead] = await Promise.all([
    repo.listUsers().catch(() => []),
    repo.listFunis().catch(() => []),
    repo.getLeadByConversation(params.id).catch(() => null),
  ]);

  return NextResponse.json({
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
    lead: lead
      ? { id: lead.id, responsavelId: lead.responsavelId ?? null, funilId: lead.funilId ?? null }
      : null,
  });
}

const schema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("transferir"), usuarioId: z.string().min(1) }),
  z.object({ acao: z.literal("crm"), funilId: z.string().min(1) }),
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

      // Conversa sem lead (quem só mandou "oi") ganha um agora: é no lead que mora o dono
      // do caso, e é ele que faz a conversa aparecer em "Meus" para quem recebeu.
      const lead =
        (await repo.getLeadByConversation(conv.id)) ??
        (await repo.upsertLead(conv.id, conv.contactName ? { contactName: conv.contactName } : {}));

      await repo.assumirLead(lead.id, destino.id, auth.session.email);
      // A AGENTE SE CALA PARA QUEM RECEBEU. Sem isto a conversa mudaria de dono no CRM e
      // a Ana continuaria respondendo por cima da pessoa.
      await repo.assumeConversation(conv.id, destino.email);
      await repo.updateConversation(conv.id, {
        handedOffTo: nome,
        handoffReason: "Transferência manual pelo painel.",
      });

      await registrarAcesso(
        auth.session,
        "transferiu_conversa",
        { tipo: "lead", id: lead.id, detalhe: `para ${nome} · conversa ${conv.id}` },
        req,
      );

      // O aviso no WhatsApp do time, como na transferência de dentro da conversa. Quem
      // transferiu para si mesmo não precisa ser avisado do que acabou de fazer.
      if (env.teamWhatsapp && destino.id !== auth.session.sub && contaComoOperacaoReal(ambienteDaConversa(conv))) {
        const contato = conv.contactName ?? conv.whatsappNumber;
        await sendMessage(
          env.teamWhatsapp,
          `🔔 *Conversa transferida*\n${contato} agora está com ${primeiroNome(nome)}.\nAbrir: ${env.appUrl}/dashboard/conversations/${conv.id}`,
        ).catch((e) => console.error("[encaminhar] falha ao avisar o time:", e instanceof Error ? e.message : e));
      }

      return NextResponse.json({ ok: true, leadId: lead.id, mensagem: `Conversa transferida para ${nome}. A agente parou de responder nela.` });
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
    const lead =
      existente ??
      (await repo.upsertLead(conv.id, conv.contactName ? { contactName: conv.contactName } : {}));

    const etapa = etapaAoTrocarDeFunil(lead.atendimentoStatus ?? "novo", funil.id, etapas);
    if (!etapa) {
      return NextResponse.json(
        {
          error: `Este caso já está encerrado, e o funil "${funil.nome}" não tem etapa para caso encerrado. Reabra o caso no CRM antes de movê-lo.`,
        },
        { status: 409 },
      );
    }

    const jaEstava = lead.funilId === funil.id;
    if (!jaEstava) await repo.updateLead(lead.id, { funilId: funil.id, etapaId: etapa.id });
    await registrarAcesso(
      auth.session,
      "enviou_ao_crm",
      { tipo: "lead", id: lead.id, detalhe: `${funil.nome} · ${etapa.nome}${existente ? "" : " · lead criado"}` },
      req,
    );

    return NextResponse.json({
      ok: true,
      leadId: lead.id,
      criado: !existente,
      mensagem: jaEstava
        ? `Este contato já estava no funil "${funil.nome}".`
        : `${existente ? "Lead enviado" : "Lead criado e enviado"} para o funil "${funil.nome}", na etapa "${etapa.nome}".`,
    });
  } catch (err) {
    console.error("[conversations/encaminhar:POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível concluir. Tente de novo em instantes." }, { status: 500 });
  }
}
