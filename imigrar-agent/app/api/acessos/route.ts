import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// O log de acesso é lido por quem administra. Ele próprio não vira linha no log: uma
// auditoria que se audita cresce sem fim e não responde nada a mais.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 200) || 200, 1000);
  const acessos = await getRepository().listAcessos(limit).catch(() => []);
  return NextResponse.json({ acessos });
}
