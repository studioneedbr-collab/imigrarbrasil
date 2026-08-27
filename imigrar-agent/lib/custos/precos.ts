// QUANTO CUSTA CADA CHAMADA.
//
// A tabela de preços é o único lugar deste módulo que envelhece sozinho: provedor muda
// preço sem avisar ninguém, e um número velho aqui não dá erro — dá um custo médio por
// conversa errado, que é justamente o número com que se fecha preço com cliente.
//
// Duas defesas contra isso:
//
//   1. Modelo fora da tabela NÃO custa zero. Custa "desconhecido", e quem soma sabe
//      disso. Somar zero calado é a mentira mais cara que uma tela de custo pode contar:
//      ela some exatamente no dia em que alguém troca o modelo.
//   2. `PRECOS_LLM` sobrescreve por ambiente, sem esperar deploy. O formato é o mesmo
//      do mapa abaixo.
//
// Valores em DÓLAR POR MILHÃO DE TOKENS (o formato em que os provedores publicam), e
// por MINUTO no caso de áudio.

import type { TipoChamadaLlm } from "@/lib/domain/types";

export interface Preco {
  /** USD por 1M de tokens de entrada. */
  entradaPorMilhao?: number;
  /** USD por 1M de tokens de saída. */
  saidaPorMilhao?: number;
  /** USD por minuto de áudio — transcrição é cobrada por tempo, não por token. */
  porMinuto?: number;
}

/**
 * Conferido em 27/08/2026 nas páginas de preço dos dois provedores. Se o custo médio por
 * conversa parecer estranho, comece por aqui: é o palpite mais provável.
 */
const TABELA: Record<string, Preco> = {
  // DeepSeek — escreve a conversa e lê os documentos.
  "deepseek-chat": { entradaPorMilhao: 0.27, saidaPorMilhao: 1.1 },
  "deepseek-reasoner": { entradaPorMilhao: 0.55, saidaPorMilhao: 2.19 },
  // OpenAI — transcrição de áudio e vetor da busca no material oficial.
  "whisper-1": { porMinuto: 0.006 },
  "gpt-4o-mini-transcribe": { porMinuto: 0.003 },
  "text-embedding-3-large": { entradaPorMilhao: 0.13 },
  "text-embedding-3-small": { entradaPorMilhao: 0.02 },
};

/** `PRECOS_LLM='{"deepseek-chat":{"entradaPorMilhao":0.3}}'` — troca preço sem deploy. */
function tabelaEfetiva(): Record<string, Preco> {
  const bruto = process.env.PRECOS_LLM;
  if (!bruto) return TABELA;
  try {
    return { ...TABELA, ...(JSON.parse(bruto) as Record<string, Preco>) };
  } catch {
    console.error("[precos] PRECOS_LLM não é um JSON válido — usando a tabela do código.");
    return TABELA;
  }
}

export interface CustoCalculado {
  usd: number;
  /** Falso = o modelo não está na tabela. O `usd` então é 0 e NÃO significa grátis. */
  conhecido: boolean;
}

export interface ChamadaParaCusto {
  modelo: string;
  tipo: TipoChamadaLlm;
  tokensEntrada?: number;
  tokensSaida?: number;
  segundos?: number | null;
}

/**
 * O custo de uma chamada, em dólar.
 *
 * A conta é boba; o que não é boba é a distinção entre zero e desconhecido, que atravessa
 * daqui até a tela.
 */
export function custoDaChamada(c: ChamadaParaCusto): CustoCalculado {
  const preco = tabelaEfetiva()[c.modelo];
  if (!preco) return { usd: 0, conhecido: false };

  if (c.tipo === "transcricao") {
    // Sem duração não dá para cobrar por minuto. Chamar de zero seria dizer que aquele
    // áudio saiu de graça; o honesto é dizer que não sabemos.
    if (preco.porMinuto === undefined) return { usd: 0, conhecido: false };
    if (!c.segundos || c.segundos <= 0) return { usd: 0, conhecido: false };
    return { usd: (c.segundos / 60) * preco.porMinuto, conhecido: true };
  }

  const entrada = ((c.tokensEntrada ?? 0) / 1_000_000) * (preco.entradaPorMilhao ?? 0);
  const saida = ((c.tokensSaida ?? 0) / 1_000_000) * (preco.saidaPorMilhao ?? 0);
  return { usd: entrada + saida, conhecido: true };
}

/** Os modelos com preço na tabela. A tela de integrações mostra para não haver dúvida. */
export function modelosComPreco(): string[] {
  return Object.keys(tabelaEfetiva()).sort();
}
