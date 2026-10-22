// ESTÁ CONECTADO? — a pergunta que decide se o negócio está captando ou parado.
//
// A lógica morava dentro da rota /api/integrations/zapi/status. Saiu para cá porque
// agora tem dois consumidores: aquela tela e o alarme de operação parada, que roda no
// servidor em toda página do painel.

import { getZapiConfig, type ZapiResolvedConfig } from "@/lib/whatsapp/config";
import { formatarTelefone } from "@/lib/whatsapp/telefone";

export interface StatusWhatsapp {
  configurado: boolean;
  conectado: boolean;
  detalhe: string;
  /** O número pareado, já formatado. Só vem quando pedido e conectado. */
  telefone?: string;
}

/**
 * QUAL NÚMERO ESTÁ PAREADO. "Conectado" sozinho não diz se é o WhatsApp da Imigrar ou o
 * de teste — e trocar de instância sem perceber é o erro que custa caro aqui. O `/device`
 * da Z-API devolve o `phone`; falha aqui não derruba o status, só some o número.
 */
async function telefoneConectado(config: ZapiResolvedConfig, headers: Record<string, string>): Promise<string | undefined> {
  try {
    const res = await fetch(`${config.baseUrl}/instances/${config.instanceId}/token/${config.token}/device`, {
      headers,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { phone?: string };
    return data.phone ? formatarTelefone(data.phone) : undefined;
  } catch {
    return undefined;
  }
}

// `comTelefone` custa uma segunda ida à Z-API: só a tela de Integrações pede. O alarme
// de operação roda em toda página do painel e não precisa do número.
export async function statusDoWhatsapp(opcoes: { comTelefone?: boolean } = {}): Promise<StatusWhatsapp> {
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
    const telefone = conectado && opcoes.comTelefone ? await telefoneConectado(config, headers) : undefined;
    return {
      configurado: true,
      conectado,
      detalhe: conectado
        ? telefone
          ? `WhatsApp conectado no número ${telefone}.`
          : "WhatsApp conectado."
        : (data.error ?? data.message ?? "WhatsApp desconectado — leia o QR Code no app da Z-API."),
      telefone,
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
