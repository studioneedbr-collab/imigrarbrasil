// QUEM ESCREVE AS RESPOSTAS — e o único lugar que sabe disso.
//
// O agente nasceu com um provedor só (DeepSeek), e o nome dele estava escrito em cada
// ponto que fazia uma chamada: a conversa, o follow-up, o detector de idioma, o teste da
// tela de Integrações. Trocar de modelo era editar cinco arquivos e torcer para não
// esquecer um — e o esquecido não dá erro, só continua gastando na conta antiga.
//
// Aqui a escolha vira DADO: o painel grava qual provedor responde (agent_config "llm"),
// e todo mundo que precisa falar com um modelo pergunta para este módulo. Os dois
// provedores falam o mesmo protocolo (chat/completions no formato OpenAI), então a troca
// é de endereço, chave e modelo — nada mais.
//
// ─────────────────────────────────────────────────────────────────────────────
// O OUTRO PROVEDOR FICA DE RESERVA, SOZINHO.
//
// Se os dois têm credencial, o que não foi escolhido assume quando o escolhido falha
// (ver lib/agent/runner.ts). Só depois dos dois é que o atendimento cai no motor
// determinístico. Ninguém precisa ligar isso: ter a segunda chave já é a decisão.
// ─────────────────────────────────────────────────────────────────────────────

import { env, emTeste } from "@/lib/env";
import { getRepository } from "@/lib/data";

export type ProvedorLlm = "deepseek" | "openai";

export const PROVEDORES_LLM: readonly ProvedorLlm[] = ["deepseek", "openai"];

export const NOME_DO_PROVEDOR: Record<ProvedorLlm, string> = {
  deepseek: "DeepSeek",
  openai: "ChatGPT (OpenAI)",
};

/** O modelo da OpenAI quando ninguém escolheu outro: sem raciocínio oculto, bom de tool. */
export const MODELO_OPENAI_PADRAO = "gpt-4.1-mini";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const CHAVE_CONFIG = "llm";

/** O que o painel grava. Tudo opcional: o que falta vem do ambiente. */
export interface LlmGravado {
  ativo?: ProvedorLlm;
  /** Chave da OpenAI colada no painel. Sem ela vale a OPENAI_API_KEY do ambiente. */
  openaiApiKey?: string;
  openaiModel?: string;
}

export interface Llm {
  provedor: ProvedorLlm;
  nome: string;
  baseUrl: string;
  /** NUNCA sai do servidor. Quem monta resposta de API usa `configurado`. */
  key: string;
  modelo: string;
  configurado: boolean;
  /** De onde veio a credencial — a tela mostra isto no lugar da chave. */
  origemDaChave: "painel" | "ambiente" | null;
}

export async function lerLlmGravado(): Promise<LlmGravado> {
  try {
    const bruto = await getRepository().getConfig<LlmGravado>(CHAVE_CONFIG);
    if (!bruto || typeof bruto !== "object") return {};
    return {
      ativo: bruto.ativo === "openai" || bruto.ativo === "deepseek" ? bruto.ativo : undefined,
      openaiApiKey: typeof bruto.openaiApiKey === "string" ? bruto.openaiApiKey : undefined,
      openaiModel: typeof bruto.openaiModel === "string" ? bruto.openaiModel : undefined,
    };
  } catch {
    // Banco fora do ar não pode calar a agente: vale o ambiente, como antes do painel.
    return {};
  }
}

export async function gravarLlm(novo: LlmGravado): Promise<void> {
  await getRepository().setConfig(CHAVE_CONFIG, novo);
}

/** Um provedor resolvido a partir de uma configuração — gravada ou ainda por gravar. */
export function montarLlm(provedor: ProvedorLlm, gravado: LlmGravado): Llm {
  if (provedor === "openai") {
    const doPainel = gravado.openaiApiKey?.trim() ?? "";
    const key = doPainel || env.openaiKey;
    return {
      provedor,
      nome: NOME_DO_PROVEDOR.openai,
      baseUrl: OPENAI_BASE_URL,
      key,
      modelo: gravado.openaiModel?.trim() || process.env.OPENAI_CHAT_MODEL || MODELO_OPENAI_PADRAO,
      configurado: Boolean(key),
      origemDaChave: doPainel ? "painel" : env.openaiKey ? "ambiente" : null,
    };
  }
  return {
    provedor,
    nome: NOME_DO_PROVEDOR.deepseek,
    baseUrl: env.deepseekBaseUrl,
    key: env.deepseekKey,
    modelo: env.deepseekModel,
    configurado: Boolean(env.deepseekKey),
    origemDaChave: env.deepseekKey ? "ambiente" : null,
  };
}

/** Os dois provedores, o escolhido primeiro. Inclui os sem credencial. */
export async function todosOsLlms(): Promise<{ ativo: ProvedorLlm; llms: Llm[] }> {
  const gravado = await lerLlmGravado();
  const ativo = gravado.ativo ?? "deepseek";
  const reserva: ProvedorLlm = ativo === "deepseek" ? "openai" : "deepseek";
  return { ativo, llms: [montarLlm(ativo, gravado), montarLlm(reserva, gravado)] };
}

/**
 * O provedor escolhido no painel, tenha credencial ou não. Para as chamadas pequenas
 * (idioma, follow-up) que já têm o próprio "se falhar, segue sem".
 */
export async function llmEscolhido(): Promise<Llm> {
  return (await todosOsLlms()).llms[0];
}

/**
 * Quem pode responder AGORA, na ordem em que deve ser tentado: o escolhido e, atrás dele,
 * a reserva — só os que têm credencial.
 *
 * DENTRO DE TESTE A LISTA É VAZIA, sempre. É a mesma proteção de `useDeepseek` em
 * lib/env.ts: uma suíte que encontra chave deixa de exercitar o motor determinístico e
 * passa a fazer chamadas pagas de verdade a cada execução.
 */
export async function llmsDisponiveis(): Promise<Llm[]> {
  if (emTeste) return [];
  return (await todosOsLlms()).llms.filter((l) => l.configurado);
}

/** O primeiro que pode responder, ou null — aí o atendimento é o determinístico. */
export async function llmEmUso(): Promise<Llm | null> {
  return (await llmsDisponiveis())[0] ?? null;
}

/**
 * Os modelos de raciocínio da OpenAI (gpt-5*, o1/o3/o4) recusam `temperature` diferente
 * do padrão e gastam parte do limite de saída pensando antes de escrever.
 */
function modeloDeRaciocinio(modelo: string): boolean {
  return /^(gpt-5|o\d)/i.test(modelo);
}

/**
 * O corpo do chat/completions, com as DUAS diferenças entre os provedores resolvidas aqui
 * e em nenhum outro lugar:
 *
 *   · a OpenAI aposentou `max_tokens` nos modelos novos — o nome é `max_completion_tokens`;
 *   · modelo de raciocínio não aceita `temperature` e precisa de folga no limite, senão
 *     gasta tudo pensando e devolve resposta vazia.
 */
export function corpoDoChat(
  llm: Pick<Llm, "provedor" | "modelo">,
  p: { messages: unknown[]; maxTokens: number; temperature: number; tools?: unknown[] },
): Record<string, unknown> {
  const corpo: Record<string, unknown> = { model: llm.modelo, messages: p.messages };
  if (p.tools?.length) {
    corpo.tools = p.tools;
    corpo.tool_choice = "auto";
  }
  if (llm.provedor === "openai") {
    if (modeloDeRaciocinio(llm.modelo)) {
      corpo.max_completion_tokens = p.maxTokens + 2048;
      corpo.reasoning_effort = "low";
    } else {
      corpo.max_completion_tokens = p.maxTokens;
      corpo.temperature = p.temperature;
    }
  } else {
    corpo.max_tokens = p.maxTokens;
    corpo.temperature = p.temperature;
  }
  return corpo;
}

/** A chamada HTTP, igual para os dois. Quem chama decide o que fazer com a resposta. */
/**
 * Quanto uma chamada pode demorar. Sem teto, um provedor travado segurava o webhook até a
 * Vercel matar a função — e aí nada era enviado, nem a resposta nem o aviso, com as
 * tools já executadas. Estourado, a chamada falha e o runner tenta a reserva ou o
 * atendimento determinístico, que ainda cabem no tempo.
 */
export const LIMITE_DA_CHAMADA_MS = 30_000;

export function chamarChat(
  llm: Llm,
  p: {
    messages: unknown[];
    maxTokens: number;
    temperature: number;
    tools?: unknown[];
    /** Teto desta chamada. Quem tem prazo menor (o turno do webhook) passa o que sobra. */
    timeoutMs?: number;
  },
): Promise<Response> {
  return fetch(`${llm.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${llm.key}` },
    body: JSON.stringify(corpoDoChat(llm, p)),
    cache: "no-store",
    signal: AbortSignal.timeout(Math.max(1, Math.min(p.timeoutMs ?? LIMITE_DA_CHAMADA_MS, LIMITE_DA_CHAMADA_MS))),
  });
}
