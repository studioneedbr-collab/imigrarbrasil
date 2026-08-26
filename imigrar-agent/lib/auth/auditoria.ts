// LOG DE ACESSO — quem abriu o quê, e quando.
//
// Não é burocracia de conformidade: é a única forma de responder à pergunta que aparece
// quando algo dá errado com o dado de alguém em situação irregular — "quem viu isso?".
// Por isso o registro acompanha a leitura do detalhe e toda exportação, e não só as
// escritas.
//
// Falhar aqui NUNCA derruba o atendimento. Um painel que para de abrir a fila porque o
// log de auditoria está indisponível é um painel que vai ser desligado.

import type { NextRequest } from "next/server";
import { getRepository } from "@/lib/data";
import type { SessionPayload } from "@/lib/auth/session";

export async function registrarAcesso(
  session: SessionPayload,
  acao: string,
  alvo?: { tipo?: string; id?: string; detalhe?: string },
  req?: NextRequest | Request,
): Promise<void> {
  try {
    // Atrás da Vercel o IP do cliente vem no x-forwarded-for; o primeiro é o dele.
    const fwd = req?.headers.get("x-forwarded-for") ?? "";
    await getRepository().registrarAcesso({
      autor: session.email,
      papel: session.role,
      acao,
      alvoTipo: alvo?.tipo ?? null,
      alvoId: alvo?.id ?? null,
      detalhe: alvo?.detalhe ?? null,
      ip: fwd.split(",")[0].trim() || null,
    });
  } catch (err) {
    console.error("[auditoria]", err instanceof Error ? err.message : err);
  }
}
