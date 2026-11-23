import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guard";
import { statusDoWhatsapp } from "@/lib/whatsapp/status";

export const dynamic = "force-dynamic";

// A lógica mora em lib/whatsapp/status.ts: além desta tela, o alarme de operação parada
// também precisa dela, e duas cópias divergiriam no primeiro ajuste.
export async function GET() {
  // A sessão é conferida AQUI, e não só no middleware: ele só olha se o cookie é válido, e
  // uma conta desativada continuava lendo esta rota. Ver getSession (lib/auth/guard.ts).
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const s = await statusDoWhatsapp({ comTelefone: true });
  return NextResponse.json({ configured: s.configurado, connected: s.conectado, detail: s.detalhe, phone: s.telefone });
}
