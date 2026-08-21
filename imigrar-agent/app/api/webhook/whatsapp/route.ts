import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { env } from "@/lib/env";
import { getRepository } from "@/lib/data";
import { respondToConversation } from "@/lib/agent";
import { sendMessage, sendDocument, sendButtons } from "@/lib/whatsapp/send";
import { getZapiConfig } from "@/lib/whatsapp/config";
import { sendBrevoEmailWithUrl } from "@/lib/email/brevo";
import { readDocument, mediaKindFor } from "@/lib/agent/vision";
import { detectarOptOut, MENSAGEM_DESPEDIDA } from "@/lib/agent/opt-out";

// Agrupamento: no WhatsApp o cliente costuma mandar a frase quebrada em várias
// mensagens. Esperamos este intervalo; se chegar outra nesse meio, esta requisição
// cede e a mais recente responde ao lote inteiro (uma resposta só, não fragmentada).
const DEBOUNCE_MS = 3500;

export const dynamic = "force-dynamic";
// processMessage faz várias escritas no Supabase + (com chave) uma chamada ao DeepSeek.
// Sem isto o default da Vercel corta a execução no meio.
export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// Escapa valores vindos do payload (nome, arquivo) antes de interpolar no HTML do
// e-mail — senão um atacante injeta HTML/links de phishing no e-mail do RH.
function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

// Payload de webhook da Z-API (on-message-received). Campos defensivos: a Z-API
// varia um pouco (isFromMe/fromMe, message.conversation/text.message).
interface ZApiWebhookBody {
  phone?: string;
  messageId?: string;
  senderName?: string;
  chatName?: string;
  isFromMe?: boolean;
  fromMe?: boolean;
  message?: { conversation?: string };
  text?: { message?: string };
  // Resposta de clique em botão/lista (formatos variam conforme a Z-API).
  buttonsResponseMessage?: { message?: string; buttonId?: string };
  listResponseMessage?: { message?: string; title?: string };
  buttonReply?: { message?: string };
  // Documento/imagem recebido (currículo etc.). Campos variam conforme a Z-API.
  document?: { documentUrl?: string; url?: string; fileName?: string; title?: string; caption?: string; mimeType?: string };
  image?: { imageUrl?: string; url?: string; caption?: string; mimeType?: string };
}

// E-mail do RH que recebe currículos/documentos encaminhados. Trocável depois.
const RH_EMAIL = process.env.RH_EMAIL ?? "rh@shinerio.com";

// URL do documento/imagem recebido, se houver. A legenda vira o texto da mensagem.
function incomingMediaUrl(
  body: ZApiWebhookBody,
): { url: string; name: string; mime: string; caption: string } | null {
  const d = body.document;
  if (d && (d.documentUrl || d.url)) {
    return {
      url: (d.documentUrl || d.url)!,
      name: d.fileName || d.title || "documento",
      mime: d.mimeType ?? "",
      caption: (d.caption ?? "").trim(),
    };
  }
  const img = body.image;
  if (img && (img.imageUrl || img.url)) {
    return {
      url: (img.imageUrl || img.url)!,
      name: "imagem.jpg",
      mime: img.mimeType ?? "image/jpeg",
      caption: (img.caption ?? "").trim(),
    };
  }
  return null;
}

// Um currículo vai pro RH; um contracheque fotografado por um cliente, não. Antes
// TODO anexo era encaminhado por e-mail ao RH — inclusive foto de ponto de colaborador.
function pareceCurriculo(nome: string, legenda: string, lido: string | null): boolean {
  const alvo = `${nome} ${legenda} ${lido ?? ""}`;
  return /curr[íi]culo|curriculum|vitae|\bcv\b/i.test(alvo);
}

// Extrai o texto da mensagem OU o rótulo do botão/lista que o cliente clicou.
function extractText(body: ZApiWebhookBody): string {
  return (
    body.message?.conversation ??
    body.text?.message ??
    body.buttonsResponseMessage?.message ??
    body.listResponseMessage?.message ??
    body.listResponseMessage?.title ??
    body.buttonReply?.message ??
    ""
  ).trim();
}

// A Z-API NÃO usa o handshake GET da Meta, mas manter a rota GET não faz mal.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (!env.webhookVerifyToken) return new NextResponse("Forbidden", { status: 403 });
  if (sp.get("hub.mode") === "subscribe" && safeEqual(sp.get("hub.verify_token") ?? "", env.webhookVerifyToken)) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  // Autenticação do webhook. Quando há um segredo configurado (WEBHOOK_VERIFY_TOKEN),
  // a requisição PRECISA provar que é legítima, senão qualquer terceiro que conheça a
  // URL poderia POSTar e fazer a conta enviar WhatsApp para números arbitrários, injetar
  // leads/mensagens e disparar o LLM. Aceitamos a prova por:
  //   (a) query ?token=<WEBHOOK_VERIFY_TOKEN>  — a Z-API sempre envia a URL configurada; OU
  //   (b) header Client-Token igual ao da conta Z-API.
  // Configure a URL do webhook na Z-API como .../api/webhook/whatsapp?token=<segredo>.
  const { clientToken } = await getZapiConfig();
  const incomingToken = req.headers.get("client-token") ?? "";
  const secret = env.webhookVerifyToken;
  if (secret) {
    const qToken = req.nextUrl.searchParams.get("token") ?? "";
    const okQuery = qToken.length > 0 && safeEqual(qToken, secret);
    const okHeader = clientToken.length > 0 && incomingToken.length > 0 && safeEqual(incomingToken, clientToken);
    if (!okQuery && !okHeader) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  } else if (clientToken && incomingToken && !safeEqual(incomingToken, clientToken)) {
    return new NextResponse("Invalid client token", { status: 401 });
  }

  let body: ZApiWebhookBody;
  try {
    body = (await req.json()) as ZApiWebhookBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // DIAGNÓSTICO (só fora de produção): estrutura do payload da Z-API para depurar.
  if (process.env.NODE_ENV !== "production") {
    console.log(
      "[webhook:diag]",
      JSON.stringify({
        keys: Object.keys(body ?? {}),
        hasPhone: Boolean(body.phone),
        fromMe: Boolean(body.isFromMe || body.fromMe),
        msgKeys: body.message ? Object.keys(body.message) : null,
        textKeys: body.text ? Object.keys(body.text) : null,
        textLen: extractText(body).length,
      }),
    );
  }

  // Ignora mensagens enviadas pela própria conta (evita loop de resposta).
  if (body.isFromMe || body.fromMe) {
    console.log("[webhook:diag] saída: fromMe");
    return NextResponse.json({ ok: true });
  }

  const phone = (body.phone ?? "").trim();
  const media = incomingMediaUrl(body);
  const text = extractText(body);

  if (!phone || (!text && !media)) {
    console.log("[webhook:diag] saída: sem phone/text/mídia");
    return NextResponse.json({ ok: true }); // nada para tratar
  }

  try {
    const repo = getRepository();
    // Deduplicação: a Z-API pode reentregar. Sem isto o cliente recebia resposta dupla.
    if (body.messageId && (await repo.hasWhatsappMessage(body.messageId))) {
      return NextResponse.json({ ok: true });
    }
    const name = body.senderName ?? body.chatName;
    const conv = await repo.getOrCreateConversation(phone, name);

    if (media) {
      // ANEXO: antes a URL era descartada (só ficava "📎 Documento recebido: imagem.jpg"),
      // o arquivo ia direto pro e-mail do RH e a Shayene nem via a mensagem. Agora o
      // arquivo é LIDO, o texto lido entra no histórico e ela responde com contexto.
      const lido = await readDocument({ url: media.url, name: media.name });
      const kind = mediaKindFor(media.mime, media.name);
      const tipo = kind === "image" ? "imagem" : kind === "audio" ? "áudio" : "documento";
      const conteudo = [
        `📎 Arquivo recebido: ${media.name}`,
        media.caption ? `Legenda do cliente: ${media.caption}` : "",
        lido
          ? `[Conteúdo lido do arquivo]\n${lido}`
          : // A Shayene não enxerga o conteúdo (não há modelo de visão configurado), mas o
            // arquivo CHEGOU e está salvo. Sem esta instrução ela pedia reenvio — chegou a
            // pedir para a candidata reenviar "em PDF" um currículo que já era PDF.
            `[Este ${tipo} chegou certinho e já está salvo no sistema — você só não consegue ENXERGAR o conteúdo dele. NUNCA peça para reenviar e NUNCA diga que o arquivo não abriu ou deu erro: o problema não é da pessoa e reenviar não muda nada. Se a legenda ou o histórico já disserem do que se trata, siga o atendimento normalmente. Se não, diga que recebeu e pergunte de um jeito natural o que ela precisa que seja feito com isso.]`,
      ]
        .filter(Boolean)
        .join("\n");
      await repo.addMessage(conv.id, "user", conteudo, body.messageId, {
        url: media.url,
        kind: mediaKindFor(media.mime, media.name),
        name: media.name,
        text: lido,
      });

      // Encaminha ao RH SÓ quando é currículo. Antes qualquer anexo virava e-mail pro RH
      // — foto de ponto de colaborador, comprovante de cliente, tudo.
      //
      // Duas portas: o nome/legenda do arquivo dizerem que é currículo, OU a conversa já
      // ser de um candidato (a Shayene fez a triagem e o lead está no funil de RH). A
      // segunda porta importa porque ela não enxerga o conteúdo do anexo: um currículo
      // salvo como "documento.pdf", ou fotografado, nunca casaria com o nome.
      const lead = await repo.getLeadByConversation(conv.id);
      const ehCandidato = lead?.setor === "rh";
      const nomeDizCurriculo = pareceCurriculo(media.name, media.caption, lido);
      if (nomeDizCurriculo || (ehCandidato && kind !== "audio")) {
        const quem = escapeHtml(lead?.contactName || conv.contactName || phone);
        const arquivo = escapeHtml(media.name);
        // Contexto da triagem: sem isto o RH recebe um arquivo solto e não sabe para
        // qual vaga a pessoa está se candidatando.
        const ficha = [
          lead?.contactName && `Nome: ${escapeHtml(lead.contactName)}`,
          lead?.servicesInterested?.length && `Vaga pretendida: ${escapeHtml(lead.servicesInterested.join(", "))}`,
          lead?.region && `Região: ${escapeHtml(lead.region)}`,
          `WhatsApp: ${escapeHtml(phone)}`,
        ].filter(Boolean) as string[];
        // Só encaminha o anexo se a URL for https (a Z-API serve mídia por https). Isso
        // evita que uma URL forjada (file:, http, host interno) seja anexada e entregue.
        const anexoSeguro = /^https:\/\//i.test(media.url);
        await sendBrevoEmailWithUrl({
          to: RH_EMAIL,
          subject: nomeDizCurriculo
            ? `Currículo recebido no WhatsApp — ${media.name}`
            : `Documento de candidato recebido no WhatsApp — ${media.name}`,
          html:
            `<p>Enviado por <strong>${quem}</strong> no WhatsApp da Shine Rio.</p>` +
            `<p>${ficha.join("<br>")}</p>` +
            `<p>Arquivo: ${arquivo}.${anexoSeguro ? " Segue em anexo." : " (anexo não encaminhado: origem não confiável)"}</p>`,
          attachmentUrl: anexoSeguro ? media.url : undefined,
          attachmentName: media.name,
        }).catch((e) => console.error("[webhook] falha ao encaminhar currículo ao RH:", e instanceof Error ? e.message : e));
      }
    } else {
      await repo.addMessage(conv.id, "user", text, body.messageId);
    }

    // Cliente respondeu → cancela qualquer follow-up pendente (ele voltou à conversa).
    await repo.cancelPendingFollowups(conv.id).catch(() => {});

    // PEDIU PARA PARAR. Vem ANTES de qualquer resposta: o que derruba o WhatsApp da
    // empresa é taxa de bloqueio/denúncia, e o caminho mais curto para uma denúncia é
    // insistir com quem acabou de pedir para parar. A leitura é determinística — deixar
    // isso a cargo do modelo é apostar o número da empresa num dia ruim dele.
    const optOut = detectarOptOut(text);
    if (optOut) {
      await repo
        .marcarOptOut(conv.id, optOut)
        .catch((e) =>
          console.error(
            "[webhook] NÃO consegui registrar o opt-out (rodou a migration 016?):",
            e instanceof Error ? e.message : e,
          ),
        );
      await repo.cancelPendingFollowups(conv.id).catch(() => {});
      if (optOut === "bloquear") {
        // Uma despedida e só. Se ele já estava marcado, nem isso — repetir a despedida
        // para quem pediu silêncio é exatamente o comportamento que gera a denúncia.
        if (!conv.optOutAt) {
          await repo.addMessage(conv.id, "assistant", MENSAGEM_DESPEDIDA);
          await sendMessage(phone, MENSAGEM_DESPEDIDA).catch((e) =>
            console.error("[webhook] falha ao enviar despedida:", e instanceof Error ? e.message : e),
          );
        }
        await repo.updateConversationStatus(conv.id, "finished").catch(() => {});
        console.log("[webhook:diag] contato pediu para parar — Shayene em silêncio neste número");
        return NextResponse.json({ ok: true });
      }
      // 'sem_followup': ele só disse que não tem interesse. A conversa continua (pode
      // mudar de ideia agora mesmo) — o que morre é a perseguição automática depois.
      console.log("[webhook:diag] sem interesse — follow-up automático desligado");
    } else if (conv.optOutAt) {
      // Ele tinha pedido silêncio e voltou a escrever por conta própria: quem puxou a
      // conversa agora foi ele. Responder é o certo — e libera o follow-up de novo.
      await repo
        .updateConversation(conv.id, { optOutAt: null, noFollowupAt: null })
        .catch(() => {});
      console.log("[webhook:diag] contato bloqueado voltou a escrever — opt-out liberado");
    }

    // SILÊNCIO SÓ QUANDO TEM GENTE DE VERDADE NA CONVERSA. Antes bastava o status
    // 'transferred' — que a própria Shayene grava ao encaminhar pro setor — e o cliente
    // ficava falando sozinho esperando um humano que nunca abriu o chat. Agora ela só
    // se cala quando alguém ASSUMIU a conversa no painel (assumedBy preenchido).
    if (conv.assumedBy) {
      await repo.updateLastMessageAt(conv.id).catch(() => {});
      console.log("[webhook:diag] conversa assumida por um atendente — Shayene em silêncio");
      return NextResponse.json({ ok: true });
    }

    // Espera curta e verifica se esta ainda é a última mensagem do cliente. Se outra
    // chegou nesse meio, cede — a requisição da mensagem mais nova responde ao lote.
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
    const msgs = await repo.listMessages(conv.id);
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (body.messageId && lastUser?.whatsappMessageId && lastUser.whatsappMessageId !== body.messageId) {
      console.log("[webhook:diag] saída: cedeu (chegou msg mais nova)");
      return NextResponse.json({ ok: true });
    }

    console.log("[webhook:diag] respondendo conversa", conv.id);
    const { reply, toolCalls, buttons } = await respondToConversation(conv.id);
    console.log("[webhook:diag] reply len", reply.length, "tools", toolCalls.length, "botoes", buttons?.length ?? 0);
    if (buttons && buttons.length) {
      await sendButtons(phone, reply, buttons);
    } else {
      await sendMessage(phone, reply);
    }
    console.log("[webhook:diag] enviado ok");

    // Se o agente gerou uma proposta, envia o PDF (por link público) na sequência.
    const proposta = toolCalls.find((t) => t.name === "gerar_proposta_pdf");
    if (proposta) {
      const r = proposta.result as { view_url?: string; filename?: string } | undefined;
      if (r?.view_url) {
        await sendDocument(phone, r.view_url, r.filename ?? "proposta-imigrar-brasil.pdf").catch((e) =>
          console.error("[webhook] falha ao enviar PDF:", e instanceof Error ? e.message : e),
        );
      }
    }
  } catch (err) {
    // Não logar o conteúdo (LGPD — pode conter CPF).
    console.error(
      `[webhook] falha ao processar mensagem ${body.messageId ?? "sem-id"}:`,
      err instanceof Error ? err.message : "erro desconhecido",
    );
  }

  return NextResponse.json({ ok: true });
}
