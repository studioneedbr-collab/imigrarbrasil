import { NextResponse } from "next/server";
import { statusDoWhatsapp } from "@/lib/whatsapp/status";

export const dynamic = "force-dynamic";

// A lógica mora em lib/whatsapp/status.ts: além desta tela, o alarme de operação parada
// também precisa dela, e duas cópias divergiriam no primeiro ajuste.
export async function GET() {
  const s = await statusDoWhatsapp();
  return NextResponse.json({ configured: s.configurado, connected: s.conectado, detail: s.detalhe });
}
