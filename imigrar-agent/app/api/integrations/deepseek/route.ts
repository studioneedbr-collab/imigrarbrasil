import { NextResponse } from "next/server";
import { env, useDeepseek } from "@/lib/env";

export const dynamic = "force-dynamic";

// Status da IA (DeepSeek): se está configurada, conectada e qual o saldo da conta.
export async function GET() {
  if (!useDeepseek) {
    return NextResponse.json({ configured: false, connected: false });
  }
  try {
    const res = await fetch(`${env.deepseekBaseUrl}/user/balance`, {
      headers: { Authorization: `Bearer ${env.deepseekKey}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({
        configured: true,
        connected: false,
        model: env.deepseekModel,
        detail: res.status === 401 ? "Chave inválida ou expirada." : `Erro ${res.status} ao consultar a IA.`,
      });
    }
    const data = (await res.json()) as {
      is_available?: boolean;
      balance_infos?: { currency: string; total_balance: string; granted_balance: string; topped_up_balance: string }[];
    };
    const info = data.balance_infos?.[0];
    return NextResponse.json({
      configured: true,
      connected: Boolean(data.is_available),
      model: env.deepseekModel,
      balance: info
        ? {
            currency: info.currency,
            total: info.total_balance,
            granted: info.granted_balance,
            toppedUp: info.topped_up_balance,
          }
        : null,
      detail: data.is_available ? "IA conectada e com saldo." : "Conta sem saldo disponível.",
    });
  } catch {
    return NextResponse.json({
      configured: true,
      connected: false,
      model: env.deepseekModel,
      detail: "Não foi possível consultar a IA.",
    });
  }
}
