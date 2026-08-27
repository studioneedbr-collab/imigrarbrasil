import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/**
 * AGENDAR RETORNO.
 *
 * A nota é obrigatória, e não por formalismo: "ligar dia 12" não diz nada a quem abrir o
 * painel daqui a duas semanas — nem a quem escreveu. "Ligar quando ele conseguir a
 * certidão consular" diz o que está esperando, por que, e o que fazer se a pessoa
 * escrever antes.
 */
const schema = z.object({
  quando: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Escolha a data do retorno."),
  nota: z.string().trim().min(3, "Escreva por que voltar a falar com esta pessoa.").max(500),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    const issue = err instanceof z.ZodError ? err.issues[0]?.message : null;
    return NextResponse.json({ error: issue ?? "Dados inválidos." }, { status: 400 });
  }

  try {
    const lembrete = await getRepository().criarLembrete({
      leadId: params.id,
      quando: input.quando,
      nota: input.nota,
      autor: auth.session.email,
    });
    return NextResponse.json({ ok: true, lembrete });
  } catch (err) {
    console.error("[lembretes:POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível agendar o retorno." }, { status: 400 });
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const lembretes = await getRepository().listLembretes({ leadId: params.id }).catch(() => []);
  return NextResponse.json({ lembretes });
}
