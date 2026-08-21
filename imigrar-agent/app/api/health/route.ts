import { NextResponse } from "next/server";
import { useSupabase, useDeepseek, useSmartAgent } from "@/lib/env";
import { getZapiConfig } from "@/lib/whatsapp/config";

export const dynamic = "force-dynamic";

// Diagnóstico rápido (sem segredos): confirma se a persistência está ligada e quais
// integrações estão configuradas. Útil para saber, num clique, se a produção está
// em modo Supabase (persistente) ou memória (dados somem entre requisições).
export async function GET() {
  let zapi = false;
  try {
    zapi = (await getZapiConfig()).configured;
  } catch {
    // ignora — reporta zapi=false
  }
  return NextResponse.json({
    ok: true,
    repo: useSupabase ? "supabase" : "memory",
    persistent: useSupabase,
    agent: useSmartAgent ? "deepseek" : "engine",
    integrations: { supabase: useSupabase, zapi, deepseek: useDeepseek },
  });
}
