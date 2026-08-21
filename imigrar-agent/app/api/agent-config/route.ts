import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  systemPrompt: z.string().min(20).optional(),
  pricing: z.unknown().optional(),
});

export async function GET() {
  const repo = getRepository();
  const systemPrompt = (await repo.getConfig<string>("system_prompt")) ?? DEFAULT_SYSTEM_PROMPT;
  const pricing = (await repo.getConfig("pricing")) ?? null;
  return NextResponse.json({ systemPrompt, pricing });
}

export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const parsed = putSchema.parse(body);
    const repo = getRepository();

    if (typeof parsed.systemPrompt === "string") {
      await repo.setConfig("system_prompt", parsed.systemPrompt);
    }
    if ("pricing" in parsed && parsed.pricing !== undefined) {
      await repo.setConfig("pricing", parsed.pricing);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao salvar configuração";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
