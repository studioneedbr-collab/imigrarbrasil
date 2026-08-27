import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireSession } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { lerChaveGeral, definirChaveGeral, detalheDaMudanca, ACAO_CHAVE_GERAL } from "@/lib/agent/estado";

export const dynamic = "force-dynamic";

// NÍVEL 1 — A CHAVE GERAL.
//
// Ler é para qualquer pessoa logada: o botão fica no topo do painel e o estado precisa
// aparecer para todo mundo. Escrever é de admin — desligar o agente inteiro não é uma
// decisão que se toma de passagem.

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ chave: await lerChaveGeral() });
}

const schema = z.object({
  ligada: z.boolean(),
  // Máximo generoso, mínimo inexistente: a obrigatoriedade do motivo ao DESLIGAR é
  // verificada abaixo, para que a mensagem de erro explique o porquê em vez de dizer
  // "string mínima 1".
  motivo: z.string().max(280).optional(),
});

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  if (!input.ligada && !(input.motivo ?? "").trim()) {
    return NextResponse.json(
      {
        error:
          "Diga por que está desligando o agente. Quem chegar amanhã e vir a operação parada precisa saber se foi um incidente ou um esquecimento.",
      },
      { status: 400 },
    );
  }

  const anterior = await lerChaveGeral();
  try {
    const nova = await definirChaveGeral(input.ligada, auth.session.email, input.motivo ?? null);

    // AUDITORIA. Estado anterior, estado novo, autor, timestamp e motivo — a linha que
    // responde "quem desligou o agente na quinta-feira?".
    await registrarAcesso(
      auth.session,
      ACAO_CHAVE_GERAL,
      {
        tipo: "agente",
        id: "chave_geral",
        detalhe: detalheDaMudanca(
          anterior.ligada ? "ligado" : "desligado",
          nova.ligada ? "ligado" : "desligado",
          nova.motivo,
        ),
      },
      req,
    );

    return NextResponse.json({ ok: true, chave: nova });
  } catch (err) {
    const msg = err instanceof Error && err.message === "motivo_obrigatorio"
      ? "Motivo obrigatório para desligar."
      : "Falha ao mudar a chave geral.";
    console.error("[agente/chave]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
