import { NextResponse } from "next/server";
import { useSupabase, useDeepseek, useSmartAgent } from "@/lib/env";
import { getZapiConfig } from "@/lib/whatsapp/config";
import { ragConfigurado } from "@/lib/agent/rag";
import { transcricaoConfigurada } from "@/lib/agent/audio";

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
  // `rag` é o que decide se a Ana consegue RESPONDER sobre imigração ou se só encaminha:
  // sem ele o prompt manda dizer "não tenho essa informação" para tudo. Fica no health
  // porque é o tipo de coisa que quebra em silêncio — sem erro nenhum, só um atendimento
  // que encaminha 100% dos casos e ninguém entende por quê.
  return NextResponse.json({
    ok: true,
    repo: useSupabase ? "supabase" : "memory",
    persistent: useSupabase,
    agent: useSmartAgent ? "deepseek" : "engine",
    integrations: {
      supabase: useSupabase,
      zapi,
      deepseek: useDeepseek,
      rag: ragConfigurado(),
      audio: transcricaoConfigurada(),
    },
  });
}
