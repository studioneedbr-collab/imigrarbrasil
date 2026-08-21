import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/guard";

// Preços por função (motor de precificação) — editável no Agent Studio.
export async function GET() {
  const items = await getRepository().listFunctionPricing();
  return NextResponse.json({ items });
}

const bodySchema = z.object({
  functionName: z.string().min(1),
  baseSalary: z.coerce.number().nonnegative(),
  schedule: z.string().min(1),
  beneficios: z.coerce.number().nonnegative().optional(),
  uniformeMes: z.coerce.number().nonnegative(),
  equipamentosFunc: z.coerce.number().nonnegative(),
  materialFunc: z.coerce.number().nonnegative(),
  priceConfirmed: z.boolean(),
});

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const params = bodySchema.parse(await req.json());
    const saved = await getRepository().upsertFunctionPricing(params);
    return NextResponse.json({ ok: true, item: saved });
  } catch (err) {
    console.error("[pricing-params:PUT]", err);
    return NextResponse.json({ error: "Falha ao salvar os parâmetros de preço" }, { status: 400 });
  }
}

// Exclui uma função de preço pelo nome (?name=...). Nome é case-sensitive (as duplicatas
// "portaria"/"Portaria" são linhas distintas).
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ error: "Informe o nome da função." }, { status: 400 });
  try {
    await getRepository().deleteFunctionPricing(name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[pricing-params:DELETE]", err);
    return NextResponse.json({ error: "Falha ao excluir a função." }, { status: 400 });
  }
}

// Lê o Supabase a cada request — sem isto o Next prerenderiza a resposta no build.
export const dynamic = "force-dynamic";
