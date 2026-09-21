import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

// O SEGREDO DAS PORTAS QUE CRIAM CASO SEM SESSÃO.
//
// Duas rotas o usam: `/api/captura/site` (o formulário) e `/api/captura/registro` (o que o
// WordPress manda quando um registro é salvo lá). Ele mora aqui e não em cada uma porque
// duas cópias da mesma regra de autenticação é a próxima lista espelhada deste projeto
// esperando para divergir em silêncio — e o jeito de divergir aqui seria uma das duas
// deixando de ser fail-closed.

/**
 * FAIL-CLOSED, a mesma postura do webhook do WhatsApp.
 *
 * Sem segredo configurado a rota RECUSA em vez de ficar aberta: uma porta que cria lead
 * sem prova nenhuma é a fila do escritório à mercê de quem souber a URL. `503` e não
 * `401` de propósito — instalação pela metade não é requisição forjada, e quem estiver
 * integrando precisa conseguir distinguir "o token está errado" de "o outro lado ainda
 * não foi configurado". São dias de procura no lugar errado.
 */
export function conferirTokenDeCaptura(
  req: NextRequest,
  headers: Record<string, string> = {},
): NextResponse | null {
  const segredo = env.siteCaptureToken;
  if (!segredo) {
    console.error(
      "[captura] RECUSADO: SITE_CAPTURE_TOKEN não está configurado. Enquanto isso não for " +
        "resolvido, nenhum lead vindo de fora é aceito.",
    );
    return NextResponse.json(
      { ok: false, error: "captura_sem_autenticacao_configurada" },
      { status: 503, headers },
    );
  }

  const enviado =
    req.headers.get("x-imigrar-token") ?? req.nextUrl.searchParams.get("token") ?? "";
  if (!enviado || !iguais(enviado, segredo)) {
    return NextResponse.json({ ok: false, error: "nao_autorizado" }, { status: 401, headers });
  }
  return null;
}

/** Comparação de tempo constante: o tempo da resposta não pode contar quantos caracteres acertou. */
function iguais(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
