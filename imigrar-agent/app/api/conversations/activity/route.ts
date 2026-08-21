import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";

/** Teto de mensagens por resposta — evita enxurrada de notificações num pico. */
const LIMIT = 20;

/**
 * Alimenta a notificação do painel. Autenticação vem do middleware, que cobre
 * /api/:path* e responde 401 sem sessão — por isso não há checagem aqui.
 * Nunca retorna o conteúdo da mensagem (pode conter CPF).
 */
export async function GET() {
  const repo = getRepository();
  const messages = await repo.listRecentUserMessages(LIMIT);
  return NextResponse.json({ messages });
}

// Lê o banco a cada request — sem isto o Next prerenderiza a resposta no build.
export const dynamic = "force-dynamic";
