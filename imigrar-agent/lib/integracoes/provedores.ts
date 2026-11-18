// OS PROVEDORES DE IA, DO JEITO QUE A TELA PRECISA VER.
//
// A tela de Integrações pedia WhatsApp e Z-API e não mostrava os provedores de LLM — que
// já estavam conectados e respondendo. O resultado é que a pergunta "a OpenAI está sendo
// usada?" não tinha onde ser respondida, e a resposta importa: uma credencial configurada
// que não recebe chamada nenhuma quase sempre quer dizer que o roteamento não está
// passando por ela, e ninguém percebe porque nada quebra.
//
// ─────────────────────────────────────────────────────────────────────────────
// A CHAVE NUNCA SAI DAQUI. NEM MASCARADA.
//
// Mascarar é o hábito que parece cuidadoso e não é: os quatro últimos caracteres de uma
// chave já bastam para confirmar QUAL chave está em uso quando alguém tem uma lista, e
// os prefixos (`sk-`, sufixos de projeto) contam de que conta ela é. Não há nada que
// alguém decida olhando meia chave que não possa decidir com "configurada" e a data da
// última chamada bem-sucedida — que é o que esta tela mostra.
// ─────────────────────────────────────────────────────────────────────────────

import { env, embeddingsConfig } from "@/lib/env";
import { chamarChat, todosOsLlms, type Llm, type ProvedorLlm } from "@/lib/agent/llm";
import { getRepository } from "@/lib/data";
import { saudeDoProvedor } from "@/lib/custos/resumo";
import type { TipoChamadaLlm } from "@/lib/domain/types";

export type CategoriaProvedor = "llm" | "transcricao" | "embedding";

export interface ProvedorNoPainel {
  /** Identificador estável, usado pelo botão "Testar conexão". */
  chave: "deepseek" | "openai-chat" | "openai-transcricao" | "openai-embedding";
  nome: string;
  categoria: CategoriaProvedor;
  /** "configurada" ou "não configurada". O valor da credencial NUNCA vem junto. */
  credencial: "configurada" | "nao_configurada";
  /**
   * Só nos provedores de LLM: "ativo" é o escolhido no painel para escrever as respostas;
   * "reserva" é o outro, que assume sozinho se o ativo falhar.
   */
  papel?: "ativo" | "reserva";
  modelo: string;
  /** Para que este provedor está sendo usado HOJE — deduzido das chamadas de fato. */
  usos: TipoChamadaLlm[];
  /** Para que ele DEVERIA estar sendo usado, segundo a configuração atual. */
  usosEsperados: TipoChamadaLlm[];
  chamadas24h: number;
  falhas24h: number;
  ultimaOk: string | null;
  ultimaFalha: string | null;
  /**
   * Configurado e sem nenhuma chamada em 24h. É o sintoma silencioso: a credencial está
   * lá, a tela diz "configurada", e o roteamento passou a não usar mais o provedor.
   * A RESERVA NÃO É OCIOSA: ficar parada enquanto o ativo funciona é o trabalho dela.
   */
  ocioso: boolean;
}

const ROTULOS: Record<TipoChamadaLlm, string> = {
  redacao: "redação",
  extracao: "extração",
  classificacao: "classificação",
  transcricao: "transcrição",
  embedding: "embedding",
  traducao: "tradução",
};

export function rotuloDoUso(t: TipoChamadaLlm): string {
  return ROTULOS[t] ?? t;
}

/**
 * O que cada provedor deveria estar fazendo, lido da configuração — não do que
 * aconteceu. Comparar as duas listas é o que revela roteamento parado.
 */
function usosEsperados(chave: ProvedorNoPainel["chave"], ativo: ProvedorLlm): TipoChamadaLlm[] {
  if (chave === "deepseek") {
    const usos: TipoChamadaLlm[] = ativo === "deepseek" ? ["redacao"] : [];
    // A leitura de documento só acontece com um modelo de visão apontado; sem ele o
    // anexo é guardado e a Ana pergunta à pessoa o que está escrito.
    if (process.env.DEEPSEEK_VISION_MODEL) usos.push("extracao");
    return usos;
  }
  if (chave === "openai-chat") return ativo === "openai" ? ["redacao"] : [];
  if (chave === "openai-transcricao") return ["transcricao"];
  return ["embedding"];
}

export async function lerProvedores(agora: Date = new Date()): Promise<ProvedorNoPainel[]> {
  const desde = new Date(agora.getTime() - 24 * 3600_000);
  const chamadas = await getRepository()
    .listChamadasLlm({ desde: new Date(agora.getTime() - 30 * 86_400_000).toISOString() })
    .catch(() => []);

  // A saúde é lida por PROVEDOR, mas a tela mostra a OpenAI em duas seções (transcrição
  // e embeddings), porque são duas perguntas diferentes de quem opera. O recorte por
  // tipo de chamada é o que permite as duas leituras sem duplicar a credencial.
  const daOpenai = chamadas.filter((c) => c.provedor === "openai");
  const { ativo, llms } = await todosOsLlms();
  const llm = (qual: ProvedorLlm) => llms.find((l) => l.provedor === qual) as Llm;
  const papel = (qual: ProvedorLlm) => (ativo === qual ? ("ativo" as const) : ("reserva" as const));

  const montar = (
    chave: ProvedorNoPainel["chave"],
    nome: string,
    categoria: CategoriaProvedor,
    configurada: boolean,
    modelo: string,
    recorte: typeof chamadas,
    provedor: string,
    papelNoAgente?: "ativo" | "reserva",
  ): ProvedorNoPainel => {
    const s = saudeDoProvedor(recorte, provedor, desde);
    const esperados = usosEsperados(chave, ativo);
    return {
      chave,
      nome,
      categoria,
      credencial: configurada ? "configurada" : "nao_configurada",
      ...(papelNoAgente ? { papel: papelNoAgente } : {}),
      modelo,
      usos: s.usos,
      usosEsperados: esperados,
      chamadas24h: s.chamadas24h,
      falhas24h: s.falhas24h,
      ultimaOk: s.ultimaOk,
      ultimaFalha: s.ultimaFalha,
      ocioso: configurada && s.chamadas24h === 0 && papelNoAgente !== "reserva",
    };
  };

  return [
    montar(
      "deepseek",
      "DeepSeek",
      "llm",
      // A pergunta é sobre a credencial, então vale a chave crua — e não a lista de
      // `llmsDisponiveis`, que é vazia dentro de teste de propósito.
      llm("deepseek").configurado,
      llm("deepseek").modelo,
      chamadas.filter((c) => c.provedor === "deepseek"),
      "deepseek",
      papel("deepseek"),
    ),
    montar(
      "openai-chat",
      "ChatGPT (OpenAI)",
      "llm",
      llm("openai").configurado,
      llm("openai").modelo,
      // Da conta da OpenAI, só o que é conversa: transcrição e embedding têm cartão próprio.
      daOpenai.filter((c) => c.tipo !== "transcricao" && c.tipo !== "embedding"),
      "openai",
      papel("openai"),
    ),
    montar(
      "openai-transcricao",
      "OpenAI — transcrição",
      "transcricao",
      Boolean(env.openaiKey),
      process.env.OPENAI_TRANSCRIBE_MODEL ?? "whisper-1",
      daOpenai.filter((c) => c.tipo === "transcricao"),
      "openai",
    ),
    montar(
      "openai-embedding",
      embeddingsConfig.provider === "openai" ? "OpenAI — embeddings" : "Embeddings (TEI)",
      "embedding",
      embeddingsConfig.provider === "openai"
        ? Boolean(embeddingsConfig.openaiKey)
        : Boolean(embeddingsConfig.url),
      embeddingsConfig.model,
      daOpenai.filter((c) => c.tipo === "embedding"),
      "openai",
    ),
  ];
}

export interface ResultadoDoTeste {
  ok: boolean;
  /** Milissegundos da chamada. É o número que diz se o provedor está lento ou fora. */
  latenciaMs: number;
  detalhe: string;
}

/**
 * DE QUEM É A CONTA. A chave não diz, e não pode ser mostrada; mas a OpenAI devolve, em
 * toda resposta, o identificador da organização dona da chave (cabeçalho
 * `openai-organization`). É o que a tela exibe para responder "em qual conta isto está
 * cobrando?" sem ninguém precisar abrir a Vercel. Não é segredo: sozinho não dá acesso
 * a nada. Outros provedores não mandam o cabeçalho, e aí não aparece nada.
 */
export function contaDaOpenai(res: { headers?: { get(nome: string): string | null } }): string {
  const org = res.headers?.get("openai-organization")?.trim().slice(0, 80);
  return org ? ` Conta (organização na OpenAI): ${org}.` : "";
}

/**
 * O ping de um provedor de LLM: uma mensagem, o mínimo de tokens. Serve tanto ao botão
 * "Testar conexão" quanto à troca de provedor no painel, que só é aceita se isto passar.
 */
export async function testarLlm(llm: Llm): Promise<ResultadoDoTeste> {
  const { registrarChamada } = await import("@/lib/custos/registro");
  if (!llm.configurado) return { ok: false, latenciaMs: 0, detalhe: "Credencial não configurada." };
  const inicio = Date.now();
  try {
    // 16 e não 1: a OpenAI recusa limite de saída abaixo disso em alguns modelos.
    const res = await chamarChat(llm, {
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 16,
      temperature: 0,
    });
    const latenciaMs = Date.now() - inicio;
    const corpo = (await res.json().catch(() => ({}))) as {
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };
    await registrarChamada({
      provedor: llm.provedor, modelo: llm.modelo, tipo: "redacao",
      tokensEntrada: corpo.usage?.prompt_tokens ?? 0,
      tokensSaida: corpo.usage?.completion_tokens ?? 0,
      duracaoMs: latenciaMs, ok: res.ok, erro: res.ok ? null : `HTTP ${res.status}`,
    });
    return {
      ok: res.ok,
      latenciaMs,
      detalhe: res.ok
        ? `O modelo respondeu.${contaDaOpenai(res)}`
        : res.status === 401
          ? "A credencial é inválida ou expirou."
          : res.status === 404
            ? `O modelo "${llm.modelo}" não existe para esta conta.`
            : corpo.error?.message?.slice(0, 160) ?? `O provedor respondeu ${res.status}.`,
    };
  } catch (err) {
    return {
      ok: false,
      latenciaMs: Date.now() - inicio,
      detalhe: err instanceof Error ? err.message.slice(0, 160) : "Não foi possível falar com o provedor.",
    };
  }
}

/**
 * A CHAMADA MÍNIMA QUE PROVA QUE FUNCIONA.
 *
 * Mínima de propósito: um "ping" de um token custa frações de centavo e prova a mesma
 * coisa que uma conversa inteira — a credencial é aceita, o modelo existe, e a rede
 * chega lá. E é registrada como qualquer outra chamada: um teste que não aparece no
 * custo é um gasto que ninguém consegue explicar depois.
 */
export async function testarProvedor(chave: ProvedorNoPainel["chave"]): Promise<ResultadoDoTeste> {
  const { registrarChamada } = await import("@/lib/custos/registro");
  const inicio = Date.now();

  try {
    if (chave === "deepseek" || chave === "openai-chat") {
      const { llms } = await todosOsLlms();
      const llm = llms.find((l) => l.provedor === (chave === "deepseek" ? "deepseek" : "openai")) as Llm;
      return await testarLlm(llm);
    }

    if (chave === "openai-embedding" && embeddingsConfig.provider === "tei") {
      if (!embeddingsConfig.url) return { ok: false, latenciaMs: 0, detalhe: "Endpoint não configurado." };
      const res = await fetch(`${embeddingsConfig.url.replace(/\/+$/, "")}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: ["ping"], normalize: true }),
        cache: "no-store",
      });
      const latenciaMs = Date.now() - inicio;
      await registrarChamada({
        provedor: "tei", modelo: embeddingsConfig.model, tipo: "embedding",
        duracaoMs: latenciaMs, ok: res.ok, erro: res.ok ? null : `HTTP ${res.status}`,
      });
      return { ok: res.ok, latenciaMs, detalhe: res.ok ? "O endpoint respondeu." : `Respondeu ${res.status}.` };
    }

    // As duas pontas da OpenAI. O teste da TRANSCRIÇÃO usa a rota de embeddings de
    // propósito: subir um arquivo de áudio só para testar custaria mais e provaria a
    // mesma coisa — a chave é a mesma conta, e é ela que está sendo testada.
    const key = chave === "openai-transcricao" ? env.openaiKey : embeddingsConfig.openaiKey;
    if (!key) return { ok: false, latenciaMs: 0, detalhe: "Credencial não configurada." };
    const modelo = embeddingsConfig.model;
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: modelo, input: "ping", dimensions: embeddingsConfig.dim }),
      cache: "no-store",
    });
    const latenciaMs = Date.now() - inicio;
    const corpo = (await res.json().catch(() => ({}))) as {
      usage?: { prompt_tokens?: number };
      error?: { message?: string };
    };
    await registrarChamada({
      provedor: "openai", modelo, tipo: "embedding",
      tokensEntrada: corpo.usage?.prompt_tokens ?? 0,
      duracaoMs: latenciaMs, ok: res.ok, erro: res.ok ? null : `HTTP ${res.status}`,
    });
    return {
      ok: res.ok,
      latenciaMs,
      detalhe: res.ok
        ? chave === "openai-transcricao"
          ? `A conta respondeu. A credencial da transcrição é a mesma.${contaDaOpenai(res)}`
          : `O modelo de embedding respondeu.${contaDaOpenai(res)}`
        : res.status === 401
          ? "A credencial é inválida ou expirou."
          : corpo.error?.message?.slice(0, 160) ?? `O provedor respondeu ${res.status}.`,
    };
  } catch (err) {
    return {
      ok: false,
      latenciaMs: Date.now() - inicio,
      detalhe: err instanceof Error ? err.message.slice(0, 160) : "Não foi possível falar com o provedor.",
    };
  }
}
