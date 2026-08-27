import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { ambienteDaConversa } from "@/lib/domain/ambiente";

/**
 * A lista de conversas do painel.
 *
 * `?ambiente=teste` devolve os ENSAIOS — o simulador e as instâncias de teste —, e é o
 * que a tela de Ensaios usa. Sem o parâmetro vêm só as conversas de operação real, que é
 * a separação que o resto do painel já fazia na fila, no quadro e nas métricas, e que
 * faltava justamente aqui: `sim:v2-5`, `sim:v2-12` e companhia apareciam no meio de
 * conversa de gente.
 */
export async function GET(req: Request) {
  const repo = getRepository();
  const querEnsaios = new URL(req.url).searchParams.get("ambiente") === "teste";
  const todas = await repo.listConversations();
  const conversations = todas.filter(
    (c) => (ambienteDaConversa(c) === "teste") === querEnsaios,
  );
  conversations.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ conversations });
}

// Lê o Supabase a cada request — sem isto o Next prerenderiza a resposta no build.
export const dynamic = "force-dynamic";
