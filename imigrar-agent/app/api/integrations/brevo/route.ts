import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { getBrevoConfig } from "@/lib/email/brevo";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type BrevoConfig = { apiKey?: string; senderEmail?: string; senderName?: string };

const putSchema = z.object({
  apiKey: z.string().optional(),
  senderEmail: z.string().email("E-mail do remetente inválido."),
  senderName: z.string().min(1).optional(),
});

export async function GET() {
  const cfg = await getBrevoConfig();
  return NextResponse.json({
    config: {
      senderEmail: cfg.senderEmail ?? "",
      senderName: cfg.senderName ?? "",
      apiKeySet: Boolean(cfg.apiKey),
      configured: cfg.configured,
    },
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const parsed = putSchema.parse(await req.json());
    const repo = getRepository();
    // Se não vier apiKey nova, mantém a que já estava salva.
    const current = (await repo.getConfig<BrevoConfig>("brevo")) ?? {};
    const value: BrevoConfig = {
      apiKey: parsed.apiKey?.trim() ? parsed.apiKey.trim() : current.apiKey,
      senderEmail: parsed.senderEmail,
      senderName: parsed.senderName?.trim() || "Shine Rio",
    };
    await repo.setConfig("brevo", value);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
    }
    return NextResponse.json({ error: "Falha ao salvar o Brevo." }, { status: 400 });
  }
}
