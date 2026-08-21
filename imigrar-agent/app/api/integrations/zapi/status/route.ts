import { NextResponse } from "next/server";
import { getZapiConfig } from "@/lib/whatsapp/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getZapiConfig();

  if (!config.configured) {
    return NextResponse.json({ connected: false, configured: false });
  }

  try {
    const headers: Record<string, string> = {};
    if (config.clientToken) headers["Client-Token"] = config.clientToken;

    const res = await fetch(
      `${config.baseUrl}/instances/${config.instanceId}/token/${config.token}/status`,
      { headers, cache: "no-store" },
    );

    const data = (await res.json().catch(() => ({}))) as {
      connected?: boolean;
      error?: string;
      message?: string;
    };

    // A Z-API devolve `error: "You are already connected."` MESMO conectado — é uma
    // mensagem informativa, não uma falha. Então o `connected` manda; só tratamos o
    // `error` como problema quando NÃO está conectado.
    const connected = Boolean(data.connected);
    return NextResponse.json({
      configured: true,
      connected,
      detail: connected
        ? "WhatsApp conectado."
        : (data.error ?? data.message ?? "WhatsApp não conectado — leia o QR Code no app da Z-API."),
    });
  } catch (err) {
    console.error("[integrations/zapi/status:GET]", err);
    return NextResponse.json({
      configured: true,
      connected: false,
      detail: "Não foi possível consultar o status.",
    });
  }
}
