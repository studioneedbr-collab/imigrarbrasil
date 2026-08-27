import { env } from "@/lib/env";
import { getRepository } from "@/lib/data";
import type { ZapiInstancia } from "@/lib/domain/types";

export interface ZapiResolvedConfig {
  instanceId: string;
  token: string;
  clientToken: string;
  baseUrl: string;
  configured: boolean;
}

type StoredZapi = { instanceId?: string; token?: string; clientToken?: string; baseUrl?: string };

const DEFAULT_BASE_URL = "https://api.z-api.io";

/**
 * Normaliza a Base URL para SÓ a origem (protocolo + host). É comum colar aqui a URL
 * completa do endpoint (`.../instances/ID/token/TK/send-text`) — o código monta o
 * caminho sozinho, então qualquer path colado quebraria tudo (NOT_FOUND). Aqui a gente
 * descarta o path e fica só com `https://api.z-api.io`.
 */
export function normalizeBaseUrl(raw?: string): string {
  if (!raw || !raw.trim()) return DEFAULT_BASE_URL;
  try {
    const u = new URL(raw.trim());
    return `${u.protocol}//${u.host}`;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

/**
 * Fonte ÚNICA das credenciais Z-API. Prioridade: o que foi salvo no painel
 * (Integrações → banco via getConfig "zapi"), com as variáveis de ambiente como
 * fallback/bootstrap. Assim o painel passa a controlar o envio de verdade — antes
 * o painel gravava no banco mas o envio só lia do ENV, então "salvar" não tinha efeito.
 */
export async function getZapiConfig(): Promise<ZapiResolvedConfig> {
  let stored: StoredZapi = {};
  try {
    stored = (await getRepository().getConfig<StoredZapi>("zapi")) ?? {};
  } catch {
    // Banco indisponível — segue só com o ENV.
  }
  const instanceId = stored.instanceId || env.zapiInstanceId;
  const token = stored.token || env.zapiToken;
  const clientToken = stored.clientToken || env.zapiClientToken;
  const baseUrl = normalizeBaseUrl(stored.baseUrl);
  return { instanceId, token, clientToken, baseUrl, configured: Boolean(instanceId && token) };
}

/**
 * Conexão REAL do WhatsApp na Z-API (WhatsApp pareado?), para o indicador da barra de
 * topo. A Z-API responde `connected:true` mesmo trazendo `error:"You are already
 * connected."` — por isso o `connected` manda. Falha de rede → false (não trava a UI).
 */
export async function getZapiConnected(): Promise<boolean> {
  const cfg = await getZapiConfig();
  if (!cfg.configured) return false;
  try {
    const headers: Record<string, string> = {};
    if (cfg.clientToken) headers["Client-Token"] = cfg.clientToken;
    const res = await fetch(`${cfg.baseUrl}/instances/${cfg.instanceId}/token/${cfg.token}/status`, {
      headers,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { connected?: boolean };
    return Boolean(data.connected);
  } catch {
    return false;
  }
}

/**
 * As credenciais de UMA instância, no formato que o envio espera.
 *
 * Com mais de uma instância cadastrada, `getZapiConfig()` deixa de ser a resposta certa
 * para "por onde eu mando": a resposta é a instância por onde a mensagem CHEGOU. Quem
 * responde por outro canal manda a mensagem do cliente de produção pelo número de teste.
 */
export function configDaInstancia(inst: ZapiInstancia): ZapiResolvedConfig {
  return {
    instanceId: inst.instanceId,
    token: inst.token,
    clientToken: inst.clientToken ?? "",
    baseUrl: normalizeBaseUrl(inst.baseUrl),
    configured: Boolean(inst.instanceId && inst.token),
  };
}

/** Conexão real de UMA instância — o mesmo `/status` da Z-API, por credencial. */
export async function conexaoDaInstancia(inst: ZapiInstancia): Promise<boolean> {
  const cfg = configDaInstancia(inst);
  if (!cfg.configured) return false;
  try {
    const headers: Record<string, string> = {};
    if (cfg.clientToken) headers["Client-Token"] = cfg.clientToken;
    const res = await fetch(`${cfg.baseUrl}/instances/${cfg.instanceId}/token/${cfg.token}/status`, {
      headers, cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { connected?: boolean };
    return Boolean(data.connected);
  } catch {
    return false;
  }
}
