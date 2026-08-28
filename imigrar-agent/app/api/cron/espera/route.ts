import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { timingSafeEq } from "@/lib/auth/secret-compare";
import { getRepository } from "@/lib/data";
import { varrerEspera } from "@/lib/followup/varredura";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A VARREDURA DA ESPERA, como rota.
//
// O laço inteiro vive em lib/followup/varredura.ts, e não aqui, porque ele também é
// chamado pelo cron de follow-ups que já existia: o plano Hobby da Vercel aceita poucos
// cron jobs, e um deploy recusado por causa de uma linha a mais no vercel.json seria um
// follow-up que nunca sai. Esta rota existe para poder disparar a varredura à mão — em
// investigação, ou num cron externo — sem esperar a passagem do outro.
export async function GET(req: NextRequest) {
  // Fail-closed em produção: sem CRON_SECRET configurado, não roda (evita cron aberto).
  if (!env.cronSecret) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Cron secret not configured", { status: 503 });
    }
  } else {
    const auth = req.headers.get("authorization") ?? "";
    const bearerOk = auth.startsWith("Bearer ") && timingSafeEq(auth.slice(7), env.cronSecret);
    const queryOk = timingSafeEq(req.nextUrl.searchParams.get("secret") ?? "", env.cronSecret);
    if (!bearerOk && !queryOk) return new NextResponse("Unauthorized", { status: 401 });
  }

  const resultado = await varrerEspera(getRepository(), new Date());
  return NextResponse.json({ ok: true, ...resultado });
}
