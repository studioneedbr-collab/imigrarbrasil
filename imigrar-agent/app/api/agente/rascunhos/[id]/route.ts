import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { ACAO_RASCUNHO, detalheDaMudanca, resolverInstancia } from "@/lib/agent/estado";
import { sendMessage, sendButtons } from "@/lib/whatsapp/send";
import { configDaInstancia } from "@/lib/whatsapp/config";

export const dynamic = "force-dynamic";

const schema = z.object({
  acao: z.enum(["enviar", "descartar"]),
  /** O texto editado. Ausente = enviar como está. */
  texto: z.string().min(1).max(4000).optional(),
  /** Por que descartou. É a parte do dado que explica o resto. */
  motivo: z.string().max(500).optional(),
});

/**
 * A DECISÃO SOBRE UM RASCUNHO DE SOMBRA: enviar como está, editar antes de enviar, ou
 * descartar.
 *
 * O par (`texto` da Ana, `textoEnviado` da pessoa) é o que vira dado de treinamento —
 * guardar só o texto final não ensinaria nada, e é por isso que a edição vai para uma
 * coluna nova em vez de sobrescrever a original.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const repo = getRepository();
  const rascunho = await repo.getRascunho(params.id);
  if (!rascunho) return NextResponse.json({ error: "Rascunho não encontrado." }, { status: 404 });
  if (rascunho.status !== "pendente") {
    return NextResponse.json(
      { error: `Este rascunho já foi ${rascunho.status === "enviado" ? "enviado" : "descartado"} por ${rascunho.decididoPor ?? "alguém"}.` },
      { status: 409 },
    );
  }

  if (input.acao === "descartar") {
    const decidido = await repo.decidirRascunho(
      params.id,
      { status: "descartado", motivo: input.motivo?.trim() || null },
      auth.session.email,
    );
    if (!decidido) return NextResponse.json({ error: "Outra pessoa decidiu este rascunho agora." }, { status: 409 });

    await registrarAcesso(
      auth.session,
      ACAO_RASCUNHO,
      { tipo: "rascunho", id: params.id, detalhe: detalheDaMudanca("pendente", "descartado", decidido.motivo) },
      req,
    );
    return NextResponse.json({ ok: true, rascunho: decidido });
  }

  const conv = await repo.getConversation(rascunho.conversationId);
  if (!conv) return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  if (conv.whatsappNumber.startsWith("sim:")) {
    return NextResponse.json({ error: "Conversa do simulador não envia WhatsApp real." }, { status: 400 });
  }

  const texto = (input.texto ?? rascunho.texto).trim();

  // A DECISÃO É GRAVADA ANTES DO ENVIO, e não depois.
  //
  // Se o envio falhar, o pior desfecho é um rascunho marcado como enviado que não saiu —
  // visível, e alguém reenvia à mão. Na ordem inversa o pior desfecho é a mesma mensagem
  // sair duas vezes para o cliente porque a gravação falhou depois do envio bem-sucedido.
  // Entre um erro visível e uma mensagem duplicada no WhatsApp de alguém, escolhemos o
  // primeiro. O `.eq(status,'pendente')` do repositório é o que segura o clique duplo.
  const decidido = await repo.decidirRascunho(
    params.id,
    { status: "enviado", textoEnviado: texto },
    auth.session.email,
  );
  if (!decidido) return NextResponse.json({ error: "Outra pessoa decidiu este rascunho agora." }, { status: 409 });

  // Sai pelo MESMO número por onde a conversa entrou.
  const instancia =
    (conv.instanciaId ? await repo.getInstancia(conv.instanciaId).catch(() => null) : null) ??
    (await resolverInstancia(null).catch(() => null));
  // Sem instância reconhecida, `undefined` cai na config única de sempre — que é a
  // resposta certa para quem tem uma instância só e para o banco anterior à 023.
  const canal = instancia ? configDaInstancia(instancia) : undefined;

  try {
    if (rascunho.botoes?.length && texto === rascunho.texto) {
      // Os botões só sobrevivem ao texto original: editado, o texto pode não ter mais
      // relação nenhuma com as opções que a Ana tinha montado.
      await sendButtons(conv.whatsappNumber, texto, rascunho.botoes, canal);
    } else {
      await sendMessage(conv.whatsappNumber, texto, canal);
    }
  } catch (err) {
    console.error("[rascunhos:enviar]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "O rascunho foi marcado como enviado, mas a Z-API recusou o envio. Confira a conexão e reenvie à mão." },
      { status: 502 },
    );
  }

  // Agora sim entra no histórico da conversa: desta vez a pessoa realmente leu.
  await repo.addMessage(rascunho.conversationId, "assistant", texto).catch(() => {});
  await repo.updateLastMessageAt(rascunho.conversationId).catch(() => {});

  // ALGUÉM RESPONDEU: o relógio da primeira resposta humana fecha. Foi um humano quem
  // decidiu mandar — mesmo que o texto tenha sido escrito pela Ana.
  if (conv.aguardandoHumanoDesde) {
    await repo.updateConversation(rascunho.conversationId, { aguardandoHumanoDesde: null }).catch(() => {});
  }

  const editado = texto !== rascunho.texto;
  await registrarAcesso(
    auth.session,
    ACAO_RASCUNHO,
    {
      tipo: "rascunho",
      id: params.id,
      detalhe: detalheDaMudanca("pendente", editado ? "enviado (editado)" : "enviado como estava"),
    },
    req,
  );

  return NextResponse.json({ ok: true, rascunho: decidido, editado });
}
