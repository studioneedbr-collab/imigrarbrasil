// ESTÁ CONECTADO? — a pergunta que decide se o negócio está captando ou parado.
//
// A lógica morava dentro da rota /api/integrations/zapi/status. Saiu para cá porque
// agora tem dois consumidores: aquela tela e o alarme de operação parada, que roda no
// servidor em toda página do painel.

import { getZapiConfig } from "@/lib/whatsapp/config";

export interface StatusWhatsapp {
  configurado: boolean;
  conectado: boolean;
  detalhe: string;
}

export async function statusDoWhatsapp(): Promise<StatusWhatsapp> {
  const config = await getZapiConfig();
  if (!config.configured) {
    return {
      configurado: false,
      conectado: false,
      detalhe: "A Z-API ainda não foi configurada — nenhuma mensagem entra nem sai.",
    };
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
    // A Z-API devolve `error: "You are already connected."` MESMO conectado — é
    // informativa, não falha. O `connected` é quem manda.
    const conectado = Boolean(data.connected);
    return {
      configurado: true,
      conectado,
      detalhe: conectado
        ? "WhatsApp conectado."
        : (data.error ?? data.message ?? "WhatsApp desconectado — leia o QR Code no app da Z-API."),
    };
  } catch (err) {
    console.error("[whatsapp/status]", err instanceof Error ? err.message : err);
    return {
      configurado: true,
      conectado: false,
      detalhe: "Não foi possível falar com a Z-API para conferir a conexão.",
    };
  }
}
