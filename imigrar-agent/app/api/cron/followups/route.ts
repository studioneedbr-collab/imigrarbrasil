import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getRepository } from "@/lib/data";
import { sendMessage } from "@/lib/whatsapp/send";
import { timingSafeEq } from "@/lib/auth/secret-compare";
import { novaRodada, podeDispararAgora } from "@/lib/whatsapp/janela";
import { varrerEspera } from "@/lib/followup/varredura";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Processa os follow-ups AGENDADOS pela própria Shayene (tool agendar_followup): envia o
// lembrete na hora marcada e baixa o pendente.
//
// Esta rota passou um tempo órfã — existia, mas não estava no vercel.json, então nenhum
// follow-up agendado pela tool jamais saiu: ficavam 'pending' no banco para sempre.
//
// CADÊNCIA — o plano Hobby da Vercel só executa cron uma vez por dia. O vercel.json
// agenda 17:00 UTC (14h de Brasília). Consequência prática: um lembrete que vence às 15h
// só sai no dia seguinte às 14h. Com o plano Pro, voltar para "30 11-22 * * 1-5" resolve.
//
// ANTIBAN: mesmas travas do cron irmão (lib/whatsapp/janela.ts) — dia útil das 8h às 20h
// de Brasília, uma mensagem por vez com intervalo variável. Aqui a janela pesa ainda
// mais: o horário vem de `delay_hours` escolhido pelo modelo, então um "me lembra em 12
// horas" às 15h vence às 3h da manhã.
//
// Segurança: exige o CRON_SECRET (Vercel manda em Authorization: Bearer; cron externo
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
  const now = Date.now();
  const due = (await repo.listPendingFollowups()).filter(
    (f) => new Date(f.scheduledAt).getTime() <= now,
  );

  const janelaAberta = podeDispararAgora(new Date());
  const rodada = novaRodada();
  let sent = 0;
  let restantes = 0;

  for (const f of due) {
    try {
      const conv = await repo.getConversation(f.conversationId);
      // Cancela só se a conversa terminou/saiu de cena; segue para conversas ainda
      // abertas ('active'/'waiting'/'negotiating'). Antes exigia 'active' e passou a
      // cancelar tudo, já que a Shayene agora deixa a conversa em 'waiting' ao responder.
      const terminal = conv && ["transferred", "finished", "inactive"].includes(conv.status);
      // Pediu para parar depois que o lembrete foi agendado: o pendente morre aqui.
      const pediuParar = conv && (conv.optOutAt || conv.noFollowupAt);
      if (!conv?.whatsappNumber || terminal || pediuParar) {
        await repo.updateFollowupStatus(f.id, "cancelled");
        continue;
      }
      // Fora da janela ou rodada cheia: fica pendente e sai na próxima passagem do cron.
      if (!janelaAberta || !rodada.podeMais()) {
        restantes++;
        continue;
      }
      await sendMessage(conv.whatsappNumber, f.message);
      await repo.addMessage(f.conversationId, "assistant", f.message);
      await repo.updateFollowupStatus(f.id, "sent");
      sent++;
      await rodada.registrarEnvio();
    } catch (err) {
      console.error("[cron/followups] falha em", f.id, err instanceof Error ? err.message : err);
    }
  }
  if (restantes) {
    console.log(
      `[cron/followups] ${restantes} lembrete(s) adiados —`,
      janelaAberta ? "teto da rodada" : "fora da janela de disparo (dia útil, 8h-20h)",
    );
  }

  // A VARREDURA DA ESPERA PEGA CARONA AQUI.
  //
  // Não por elegância: o plano Hobby da Vercel aceita poucos cron jobs, e um deploy
  // recusado por causa de uma linha a mais no vercel.json seria um follow-up que nunca
  // sai. A regra inteira vive em lib/followup/varredura.ts e tem rota própria
  // (/api/cron/espera) para quem quiser disparar à mão.
  //
  // Ela roda DEPOIS dos lembretes agendados e nunca derruba esta resposta: os dois
  // trabalhos são independentes, e uma falha na régua nova não pode impedir que o
  // lembrete que a Ana marcou saia.
  const espera = await varrerEspera(repo, new Date()).catch((e) => {
    console.error("[cron/followups] varredura da espera falhou:", e instanceof Error ? e.message : e);
    return null;
  });

  return NextResponse.json({
    ok: true,
    processed: due.length,
    sent,
    restantes,
    janelaAberta,
    espera,
  });
}
