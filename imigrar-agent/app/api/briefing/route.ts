import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/guard";

// Briefing da empresa — respostas usadas para o agente entender o negócio.
export async function GET() {
  const answers =
    (await getRepository().getConfig<Record<string, string>>("briefing")) ?? {};
  return NextResponse.json({ answers });
}

const bodySchema = z.object({
  answers: z.record(z.string(), z.string()),
});

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { answers } = bodySchema.parse(await req.json());
    await getRepository().setConfig("briefing", answers);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[briefing:PUT]", err);
    return NextResponse.json({ error: "Falha ao salvar o briefing" }, { status: 400 });
  }
}

// Lê o Supabase a cada request — sem isto o Next prerenderiza a resposta no build.
export const dynamic = "force-dynamic";
