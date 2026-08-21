import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { getKnowledgeBase } from "@/lib/agent/system-prompt";
import { buildSystemPrompt } from "@/lib/agent/knowledge";
import { requireAdmin } from "@/lib/auth/guard";

// Base de Conhecimento do agente — editável no Agent Studio.
export async function GET() {
  const kb = await getKnowledgeBase();
  return NextResponse.json({ knowledge: kb, preview: buildSystemPrompt(kb) });
}

const sectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
});
const bodySchema = z.object({
  persona: z.string().min(10),
  sections: z.array(sectionSchema).min(1),
});

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const kb = bodySchema.parse(await req.json());
    await getRepository().setConfig("knowledge_base", kb);
    return NextResponse.json({ ok: true, preview: buildSystemPrompt(kb) });
  } catch (err) {
    console.error("[knowledge:PUT]", err);
    return NextResponse.json({ error: "Falha ao salvar a base de conhecimento" }, { status: 400 });
  }
}

// Lê o Supabase a cada request — sem isto o Next prerenderiza a resposta no build.
export const dynamic = "force-dynamic";
