import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { timingSafeEq } from "@/lib/auth/secret-compare";
import { getRepository } from "@/lib/data";
import { sendMessage } from "@/lib/whatsapp/send";
import { generateFollowupMessage } from "@/lib/agent/followup";
import { novaRodada, podeDispararAgora } from "@/lib/whatsapp/janela";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron: gestão do ciclo de vida das conversas.
//
// CADÊNCIA — o plano Hobby da Vercel só executa cron UMA VEZ POR DIA, e recusa o deploy
// inteiro com outra frequência ("Hobby accounts are limited to daily cron jobs"). Por
// isso o vercel.json agenda 12:00 UTC (9h de Brasília), dentro da janela de disparo. Com
// o plano Pro, voltar para "0 11-22 * * 1-5" faz a varredura de hora em hora e nenhuma
// outra linha precisa mudar — o teto por rodada (MAX_POR_RODADA) já existe justamente
// para isso.
// (1) Conversas 'waiting' há mais de 24h sem retorno → follow-up INTELIGENTE (DeepSeek,
//     com o contexto da conversa), marca followup_sent_at e mantém 'waiting'.
// (2) Conversas cujo follow-up já saiu há +24h e seguem sem resposta → 'inactive'.
//
// ANTIBAN: esta é a única rota em que a Shine fala PRIMEIRO, então é aqui que mora o
// risco de o número ser derrubado. Duas travas, ambas em lib/whatsapp/janela.ts:
// só dispara em dia útil entre 8h e 20h (Brasília), e uma mensagem de cada vez, com
// intervalo variável. Antes o laço mandava tudo que estava vencido em sequência — com 60
// conversas paradas eram 60 mensagens do mesmo número em segundos. Quem não couber na
// rodada fica para a próxima; o campo `restantes` da resposta mostra a fila.
//
// Segurança: exige CRON_SECRET (Vercel manda em Authorization: Bearer; cron externo
// pode usar ?secret=). Sem segredo configurado, aceita (dev).
export async function GET(req: NextRequest) {
  // Fail-closed em produção: sem CRON_SECRET configurado, não roda (evita cron aberto).
  if (!env.cronSecret) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Cron secret not configured", { status: 503 });
    }
  } else {
    const auth = req.headers.get("authorization") ?? "";
    const bearerOk = auth.startsWith("Bearer ") && timingSafeEq(auth.slice(7), env.cronSecret);
    const queryOk = timingSafeEq(req.nextUrl.searchParams.get("secret") ?? "", env.cronSecret);
    if (!bearerOk && !queryOk) return new NextResponse("Unauthorized", { status: 401 });
  }

  const repo = getRepository();

  // 1) Follow-up de 24h. Só em horário civilizado — a marcação de inatividade (2) não
  //    manda nada para o cliente e por isso roda a qualquer hora.
  const forFollowup = await repo.getConversationsForFollowup();
  const janelaAberta = podeDispararAgora(new Date());
  const rodada = novaRodada();
  let followedUp = 0;
  let restantes = 0;

  for (const conv of forFollowup) {
    // Conversa de simulador não tem WhatsApp: encerra o ciclo sem gastar a rodada.
    if (!conv.whatsappNumber || conv.whatsappNumber.startsWith("sim:")) {
      await repo.markFollowupSent(conv.id).catch(() => {});
      continue;
    }
    if (!janelaAberta || !rodada.podeMais()) {
      restantes++;
      continue;
    }
    try {
      const messages = await repo.listMessages(conv.id);
      const msg = await generateFollowupMessage(conv, messages);
      await sendMessage(conv.whatsappNumber, msg);
      await repo.addMessage(conv.id, "assistant", msg);
      await repo.markFollowupSent(conv.id); // status permanece 'waiting'
      followedUp++;
      await rodada.registrarEnvio();
    } catch (err) {
      console.error("[cron/followup] falha no follow-up", conv.id, err instanceof Error ? err.message : err);
    }
  }
  if (restantes) {
    console.log(
      `[cron/followup] ${restantes} follow-up(s) adiados —`,
      janelaAberta ? "teto da rodada" : "fora da janela de disparo (dia útil, 8h-20h)",
    );
  }

  // 2) Inatividade: follow-up já enviado há +24h e ainda sem resposta.
  const inactive = await repo.getInactiveConversations();
  let markedInactive = 0;
  for (const conv of inactive) {
    try {
      await repo.updateConversationStatus(conv.id, "inactive");
      await repo.addMessage(
        conv.id,
        "assistant",
        "[sistema] Conversa encerrada por inatividade — sem resposta após o follow-up de 24h.",
      );
      markedInactive++;
    } catch (err) {
      console.error("[cron/followup] falha ao marcar inativa", conv.id, err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ ok: true, followedUp, restantes, janelaAberta, markedInactive });
}
