import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// "Treinar a Shayene": perguntas e respostas livres que a equipe ensina. Entram no
// system prompt (getFaqBlock) e a Shayene responde com as próprias palavras.
export type FaqItem = { pergunta: string; resposta: string };

export async function GET() {
  const items = (await getRepository().getConfig<FaqItem[]>("faq")) ?? [];
  return NextResponse.json({ items });
}

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        pergunta: z.string().trim().min(1).max(500),
        resposta: z.string().trim().min(1).max(2000),
      }),
    )
    .max(200),
});

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const { items } = bodySchema.parse(await req.json());
    await getRepository().setConfig("faq", items);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[faq:PUT]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Falha ao salvar o FAQ." }, { status: 400 });
  }
}
