import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { env } from "@/lib/env";
import { getRepository } from "@/lib/data";
import { respondToConversation } from "@/lib/agent";
import { sendMessage, sendDocument, sendButtons } from "@/lib/whatsapp/send";
import { getZapiConfig } from "@/lib/whatsapp/config";
import { sendBrevoEmailWithUrl } from "@/lib/email/brevo";
import { readDocument, mediaKindFor } from "@/lib/agent/vision";
import { transcreverAudio, transcricaoConfigurada } from "@/lib/agent/audio";
import { registrarIdioma } from "@/lib/agent/idioma";
import { detectarOptOut, MENSAGEM_DESPEDIDA } from "@/lib/agent/opt-out";
import { decidirAtendimento, mensagemAgenteDesligado } from "@/lib/agent/ativacao";
import { lerChaveGeral, resolverInstancia } from "@/lib/agent/estado";
import { configDaInstancia } from "@/lib/whatsapp/config";

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
  // POR ONDE ESTA MENSAGEM ENTROU. É o campo que liga a mensagem à instância cadastrada
  // no painel — e, por ela, ao ambiente (teste/produção) e ao estado de ativação.
  instanceId?: string;
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
  // Áudio/PTT. A Z-API varia entre `audio` e `ptt` conforme o tipo de gravação.
  audio?: { audioUrl?: string; url?: string; mimeType?: string; seconds?: number };
  ptt?: { audioUrl?: string; url?: string; mimeType?: string; seconds?: number };
}

// E-mail do RH que recebe currículos/documentos encaminhados.
//
// SEM DEFAULT DE PROPÓSITO. Aqui havia um endereço da Shine Rio herdado da duplicação, o
// que significa que um currículo enviado ao WhatsApp da Imigrar Brasil ia, com anexo,
// para a caixa de outra empresa. Vazio agora significa "não encaminha" — configure
// RH_EMAIL para ligar o encaminhamento.
const RH_EMAIL = env.rhEmail;

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
  // ÁUDIO. Antes não era reconhecido aqui: a mensagem não tinha texto nem mídia, caía no
  // early-return de "nada para tratar" e o atendimento simplesmente não acontecia para
  // quem manda voz — que neste público é muita gente.
  const aud = body.audio ?? body.ptt;
  if (aud && (aud.audioUrl || aud.url)) {
    return {
      url: (aud.audioUrl || aud.url)!,
      name: "audio.ogg",
      mime: aud.mimeType ?? "audio/ogg",
      caption: "",
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
  // O corpo é lido ANTES da conferência do Client-Token porque é ele que diz de qual
  // instância a mensagem veio — e cada instância tem o seu token. Ler não é agir: nada
  // do payload é usado antes de a requisição provar que é legítima.
  let body: ZApiWebhookBody;
  try {
    body = (await req.json()) as ZApiWebhookBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const secret = env.webhookVerifyToken;
  const qToken = req.nextUrl.searchParams.get("token") ?? "";
  const incomingToken = req.headers.get("client-token") ?? "";
  const okQuery = Boolean(secret) && qToken.length > 0 && safeEqual(qToken, secret);

  // A instância só é procurada quando o token da URL NÃO bastou. Isso mantém o caminho
  // normal (a Z-API sempre manda a URL configurada, com o token) sem nenhuma ida ao banco
  // antes da autenticação — quem não sabe o segredo não faz o webhook consultar nada.
  let instancia = okQuery ? null : await resolverInstancia(body.instanceId).catch(() => null);
  if (!okQuery) {
    const clientToken = instancia?.clientToken || (await getZapiConfig()).clientToken;
    const okHeader = clientToken.length > 0 && incomingToken.length > 0 && safeEqual(incomingToken, clientToken);
    if (secret) {
      if (!okHeader) return new NextResponse("Unauthorized", { status: 401 });
    } else if (clientToken && incomingToken && !safeEqual(incomingToken, clientToken)) {
      return new NextResponse("Invalid client token", { status: 401 });
    }
  }
  if (!instancia) instancia = await resolverInstancia(body.instanceId).catch(() => null);

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

    // ONDE ESTA CONVERSA ACONTECEU. Gravado uma vez, na primeira mensagem, e nunca
    // reescrito: promover a instância de teste a produção amanhã não transforma
    // retroativamente os ensaios de hoje em atendimento real — e é este campo que decide
    // se a conversa entra nas métricas e na fila de trabalho.
    if (instancia && !conv.instanciaId) {
      await repo
        .updateConversation(conv.id, {
          instanciaId: instancia.id || null,
          ambiente: instancia.ambiente,
        })
        .catch((e) => console.error("[webhook] não gravei a instância da conversa:", e instanceof Error ? e.message : e));
    }

    if (media) {
      // ANEXO: antes a URL era descartada (só ficava "📎 Documento recebido: imagem.jpg"),
      // o arquivo ia direto pro e-mail do RH e a Shayene nem via a mensagem. Agora o
      // arquivo é LIDO, o texto lido entra no histórico e ela responde com contexto.
      const kind = mediaKindFor(media.mime, media.name);
      const tipo = kind === "image" ? "imagem" : kind === "audio" ? "áudio" : "documento";

      // ÁUDIO passa por transcrição, não por visão. E o resultado NÃO entra como "arquivo
      // recebido": entra como o que a pessoa DISSE. Um áudio é uma mensagem, não um anexo
      // — tratá-lo como anexo fazia a Ana responder sobre o arquivo em vez de responder à
      // pessoa. O idioma detectado aqui é o mesmo sinal que a regra de idioma usa.
      let lido: string | null = null;
      let transcrito = false;
      let idiomaDoAudio: string | undefined;
      if (kind === "audio") {
        const t = await transcreverAudio({ url: media.url, mime: media.mime });
        if (t) {
          lido = t.texto;
          transcrito = true;
          idiomaDoAudio = t.idioma;
        } else {
          // ÁUDIO NÃO TRANSCRITO NÃO PODE SUMIR EM SILÊNCIO.
          //
          // O atendimento continua — a Ana pede, com cuidado, que a pessoa escreva. Mas
          // quem manda áudio aqui é justamente quem tem dificuldade de escrever, quem
          // está com pressa e quem está com medo. Boa parte não volta. Sem este registro,
          // esse lead perdido não aparece em métrica nenhuma; com ele, alguém do time
          // pode OUVIR o áudio no painel e resgatar a conversa.
          await repo.registrarEventoOperacao({
            tipo: "transcricao_falhou",
            conversationId: conv.id,
            mediaUrl: media.url,
            detalhe: transcricaoConfigurada()
              ? "A transcrição está configurada mas falhou nesta mensagem."
              : "Sem OPENAI_API_KEY: a transcrição está desligada.",
          });
        }
      } else {
        lido = await readDocument({ url: media.url, name: media.name });
      }

      const conteudo = transcrito
        ? `🎤 Mensagem de voz (transcrita):\n${lido}`
        : [
            `📎 Arquivo recebido: ${media.name}`,
            media.caption ? `Legenda do cliente: ${media.caption}` : "",
            lido
              ? `[Conteúdo lido do arquivo]\n${lido}`
              : kind === "audio"
                ? // Áudio chegou mas a transcrição não está configurada (falta OPENAI_API_KEY).
                  // Pedir para escrever é ACEITÁVEL aqui — e é a única saída honesta —, mas
                  // tem de ser pedido com cuidado: quem manda áudio muitas vezes manda porque
                  // escrever é difícil.
                  `[A pessoa mandou um ÁUDIO e você não consegue ouvir. Não invente o que ela disse e não peça para reenviar o áudio (reenviar não muda nada). Peça, com delicadeza e no idioma da conversa, que ela escreva o que precisa — e diga que se preferir você já pode passar para alguém do time jurídico falar com ela.]`
                : // Não há modelo de visão configurado, mas o arquivo CHEGOU e está salvo.
                  // Sem esta instrução ela pedia reenvio — chegou a pedir para a candidata
                  // reenviar "em PDF" um currículo que já era PDF.
                  `[Este ${tipo} chegou certinho e já está salvo no sistema — você só não consegue ENXERGAR o conteúdo dele. NUNCA peça para reenviar e NUNCA diga que o arquivo não abriu ou deu erro: o problema não é da pessoa e reenviar não muda nada. Se a legenda ou o histórico já disserem do que se trata, siga o atendimento normalmente. Se não, diga que recebeu e pergunte de um jeito natural o que ela precisa que seja feito com isso.]`,
          ]
            .filter(Boolean)
            .join("\n");

      await repo.addMessage(conv.id, "user", conteudo, body.messageId, {
        url: media.url,
        kind,
        name: media.name,
        text: lido,
      });

      // Idioma detectado no áudio: gravado no contato para os próximos turnos (inclusive
      // os de texto, e o follow-up automático, que sai sem ninguém por perto).
      if (idiomaDoAudio) {
        await registrarIdioma(conv.id, idiomaDoAudio).catch(() => {});
      }

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
      if (RH_EMAIL && (nomeDizCurriculo || (ehCandidato && kind !== "audio"))) {
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
            `<p>Enviado por <strong>${quem}</strong> no WhatsApp da Imigrar Brasil.</p>` +
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
          await sendMessage(phone, MENSAGEM_DESPEDIDA, instancia ? configDaInstancia(instancia) : undefined).catch((e) =>
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

    // ─────────────────────────────────────────────────────────────────────────
    // A DECISÃO DE ATENDER — os três níveis de ativação, num lugar só.
    //
    // Repare no que já aconteceu ANTES desta linha: a mensagem foi recebida, o anexo foi
    // lido, tudo foi gravado e já aparece no painel. Nenhum caminho daqui para baixo
    // apaga nada. Desligado nunca significa ignorar — significa que o que VOLTA para o
    // cliente é outro.
    // ─────────────────────────────────────────────────────────────────────────
    const chaveGeral = await lerChaveGeral();
    const decisao = decidirAtendimento({
      chaveGeral,
      instancia,
      conversaAssumidaPor: conv.assumedBy,
    });
    // Por onde a resposta sai: o MESMO número por onde ela entrou. Responder pela config
    // padrão mandaria a mensagem de um cliente de produção pelo WhatsApp de teste.
    const canal = instancia ? configDaInstancia(instancia) : undefined;

    if (decisao.acao !== "responder") {
      await repo.updateLastMessageAt(conv.id).catch(() => {});

      // O RELÓGIO DA PRIMEIRA RESPOSTA HUMANA começa aqui, e é o que impede o agente
      // desligado de virar um buraco: a conversa entra na fila esperando gente, com SLA
      // correndo, e sobe quando o prazo estoura. Só abre uma vez — se já estava aberto,
      // reabrir zeraria o relógio a cada mensagem nova de quem está sendo ignorado.
      if (decisao.aguardaHumano && !conv.aguardandoHumanoDesde) {
        await repo
          .updateConversation(conv.id, { aguardandoHumanoDesde: new Date().toISOString() })
          .catch((e) => console.error("[webhook] não abri o relógio de resposta humana:", e instanceof Error ? e.message : e));
      }

      if (decisao.acao === "resposta_fixa") {
        const aviso = mensagemAgenteDesligado(new Date(), instancia?.respostaFixa);
        // Gravada como mensagem da casa porque foi isso que a pessoa recebeu. Quem abrir
        // a conversa no painel precisa ver exatamente o que ela leu.
        await repo.addMessage(conv.id, "assistant", aviso).catch(() => {});
        await sendMessage(phone, aviso, canal).catch((e) =>
          console.error("[webhook] falha ao enviar o aviso de agente desligado:", e instanceof Error ? e.message : e),
        );
      }

      if (decisao.acao === "sombra") {
        // Espera o lote fechar igual ao caminho normal — um rascunho montado sobre meia
        // frase avalia a Ana pelo que ela não teve chance de ler.
        await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
        const msgs = await repo.listMessages(conv.id);
        const lastUser = [...msgs].reverse().find((m) => m.role === "user");
        if (body.messageId && lastUser?.whatsappMessageId && lastUser.whatsappMessageId !== body.messageId) {
          console.log("[webhook:diag] sombra: cedeu (chegou msg mais nova)");
          return NextResponse.json({ ok: true });
        }
        try {
          const { reply, buttons } = await respondToConversation(conv.id, { sombra: true });
          await repo.criarRascunho({
            conversationId: conv.id,
            messageId: lastUser?.id ?? null,
            texto: reply,
            botoes: buttons ?? null,
          });
          console.log("[webhook:diag] modo sombra: rascunho gravado, nada enviado");
        } catch (err) {
          console.error("[webhook] modo sombra falhou:", err instanceof Error ? err.message : err);
        }
      }

      console.log(`[webhook:diag] agente não respondeu (${decisao.acao}/${decisao.nivel}): ${decisao.motivo}`);
      return NextResponse.json({ ok: true });
    }

    // O RELÓGIO DA PRIMEIRA RESPOSTA HUMANA NÃO É FECHADO AQUI, de propósito.
    //
    // A Ana voltar a responder não desfaz o fato de que esta conversa chegou enquanto o
    // agente estava desligado e ninguém do time olhou para ela. Quem fecha aquele relógio
    // é um humano — respondendo, assumindo, ou decidindo um rascunho de sombra. Fechá-lo
    // aqui faria o caso sumir da fila no momento em que o agente fosse religado, que é
    // exatamente quando alguém ainda precisa conferir o que aconteceu no período parado.

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
      await sendButtons(phone, reply, buttons, canal);
    } else {
      await sendMessage(phone, reply, canal);
    }
    console.log("[webhook:diag] enviado ok");

    // Se o agente gerou uma proposta, envia o PDF (por link público) na sequência.
    const proposta = toolCalls.find((t) => t.name === "gerar_proposta_pdf");
    if (proposta) {
      const r = proposta.result as { view_url?: string; filename?: string } | undefined;
      if (r?.view_url) {
        await sendDocument(phone, r.view_url, r.filename ?? "proposta-imigrar-brasil.pdf", canal).catch((e) =>
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
