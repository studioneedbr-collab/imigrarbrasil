// A BASE DE CONHECIMENTO JURÍDICA, LIGADA AO ATENDIMENTO.
//
// O prompt da Ana manda responder EXCLUSIVAMENTE com base no material oficial. Enquanto
// este módulo não existiu, não havia material oficial nenhum chegando até ela — e o
// comportamento correto do agente era dizer que não sabe e encaminhar TUDO. Ou seja: o
// atendimento de imigração não existia, só o encaminhamento.
//
// Aqui a recuperação é DETERMINÍSTICA e roda a cada turno, como a captura do lead: não
// depende de o modelo lembrar de chamar uma tool. A tool existe (`buscar_material_oficial`)
// para quando ele precisar procurar um termo específico no meio da conversa, mas o
// caminho normal é o bloco injetado pelo orquestrador.
//
// DEGRADAÇÃO: sem Supabase ou sem provedor de embeddings, tudo aqui devolve vazio em
// silêncio. O atendimento continua — a Ana só volta a dizer que não tem a informação.
// Nada neste arquivo pode lançar para dentro do fluxo da conversa.

import { createServerClient } from "@/lib/supabase/client";
import { embeddingsConfig, useSupabase } from "@/lib/env";

/** Uma linha do `buscar_chunks` (migration 017). */
export interface ChunkRecuperado {
  id: string;
  fonte: string;
  documento: string;
  colecao: "cartilha" | "legislacao" | "doutrina";
  titulo: string;
  secao: string | null;
  diploma: string | null;
  artigo: string | null;
  pagina_inicio: number;
  pagina_fim: number;
  atualizado_em: string | null;
  alerta_desatualizacao: string | null;
  texto: string;
  escore: number;
}

export type Colecao = "cartilha" | "legislacao" | "doutrina";

/**
 * Coleções na ordem em que o atendimento as quer. A cartilha vem primeiro porque é
 * linguagem acessível; legislação e doutrina são 82% do acervo e, sem essa separação,
 * dominam a recuperação com texto legal bruto onde cabia uma explicação (medido na
 * bateria do `ingestao/buscar.py`).
 */
const COLECOES_PADRAO: Colecao[] = ["cartilha"];
const COLECOES_COM_LEI: Colecao[] = ["cartilha", "legislacao"];

/** Sinais de que a pergunta quer o dispositivo legal, não a explicação da cartilha. */
const PEDE_LEI =
  /\b(lei|artigo|art\.?\s*\d|decreto|portaria|resolu[çc][ãa]o|norma|legisla[çc][ãa]o|estatuto|c[óo]digo|regulamento|ley|art[íi]culo|statute|law)\b/i;

/**
 * Mensagens que não valem uma busca. Saudação, agradecimento, "ok", um número solto de
 * botão — buscar aqui é gastar uma chamada de embedding para recuperar ruído, e ruído
 * injetado no prompt é pior do que contexto nenhum: o modelo tenta usar.
 */
export function valeBuscar(texto: string): boolean {
  const t = (texto ?? "").trim();
  if (t.length < 12) return false;
  // Sem \p{L}/\p{N}: o projeto compila para um alvo em que a flag `u` não está disponível.
  // A faixa latina cobre o que esta checagem precisa — ela só existe para reconhecer
  // saudação e agradecimento, que aqui chegam em português, espanhol, inglês ou francês.
  const semPontuacao = t
    .toLowerCase()
    .replace(/[^0-9a-zà-öø-ÿ\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const SOCIAL =
    /^(oi+|ol[áa]|hey|hi|hello|hola|bom dia|boa tarde|boa noite|tudo bem|tudo bom|obrigad[oa]+|valeu|vlw|ok+|okay|blz|beleza|certo|entendi|perfeito|gracias|thanks|thank you|merci|sim|n[ãa]o|yes|no|s[íi]|claro|por favor|please|ajuda|help|bom|legal)([\s!.,]*)$/;
  if (SOCIAL.test(semPontuacao)) return false;
  // Precisa ter pelo menos três palavras de conteúdo — "quero visto" já passa, "aa bb" não.
  return semPontuacao.split(" ").filter((p) => p.length > 2).length >= 3;
}

/** Escolhe as coleções pela cara da pergunta. */
export function colecoesPara(texto: string): Colecao[] {
  return PEDE_LEI.test(texto) ? COLECOES_COM_LEI : COLECOES_PADRAO;
}

// ─────────────────────────────────────────────────────────── embeddings da consulta
//
// O vetor da consulta TEM de sair do mesmo modelo que indexou os chunks. Trocar o modelo
// (ou a dimensão) sem reindexar não dá erro: dá recuperação silenciosamente ruim. Por
// isso as variáveis aqui são as MESMAS do `ingestao/embed_upsert.py`, com os mesmos
// defaults — para que o runtime e a ingestão não possam divergir por descuido.

/** Cache de vetores por consulta. A mesma pergunta reaparece muito (retomada, follow-up). */
const cacheVetor = new Map<string, number[]>();
const CACHE_MAX = 200;

function lembrar(chave: string, vetor: number[]): number[] {
  if (cacheVetor.size >= CACHE_MAX) {
    const primeira = cacheVetor.keys().next().value;
    if (primeira !== undefined) cacheVetor.delete(primeira);
  }
  cacheVetor.set(chave, vetor);
  return vetor;
}

/** Provedor de embeddings configurado? Sem isto não há busca vetorial possível. */
export function ragConfigurado(): boolean {
  const c = embeddingsConfig;
  if (!useSupabase) return false;
  return c.provider === "openai" ? Boolean(c.openaiKey) : Boolean(c.url);
}

/**
 * Vetor da consulta. Devolve null (sem lançar) em qualquer falha — a busca então
 * degrada para só-texto, que ainda recupera termo jurídico exato em português.
 */
export async function embeddingDaConsulta(texto: string): Promise<number[] | null> {
  const c = embeddingsConfig;
  const chave = `${c.provider}:${c.model}:${c.dim}:${texto}`;
  const emCache = cacheVetor.get(chave);
  if (emCache) return emCache;

  try {
    if (c.provider === "openai") {
      if (!c.openaiKey) return null;
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.openaiKey}` },
        body: JSON.stringify({ model: c.model, input: texto, dimensions: c.dim }),
        cache: "no-store",
      });
      if (!res.ok) {
        console.error("[rag] embedding falhou:", res.status, await res.text().catch(() => ""));
        return null;
      }
      const json = (await res.json()) as { data?: { embedding?: number[] }[] };
      const vetor = json.data?.[0]?.embedding;
      return Array.isArray(vetor) ? lembrar(chave, vetor) : null;
    }
    // Text Embeddings Inference (BGE-M3 / multilingual-e5-large auto-hospedado).
    if (!c.url) return null;
    const res = await fetch(`${c.url.replace(/\/+$/, "")}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: [texto], normalize: true }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[rag] embedding (tei) falhou:", res.status);
      return null;
    }
    const json = (await res.json()) as number[][];
    const vetor = json?.[0];
    return Array.isArray(vetor) ? lembrar(chave, vetor) : null;
  } catch (err) {
    console.error("[rag] embedding indisponível:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────── busca

export interface BuscaOpcoes {
  colecoes?: Colecao[];
  limite?: number;
}

/**
 * Busca híbrida (vetorial + textual, fundidas por RRF no SQL da migration 017).
 *
 * Devolve [] em qualquer falha. Uma base fora do ar não pode derrubar o atendimento:
 * sem trechos, a Ana diz que não tem a informação e encaminha — que é o comportamento
 * seguro e o que o prompt já manda fazer.
 */
export async function buscarChunks(
  consulta: string,
  opcoes: BuscaOpcoes = {},
): Promise<ChunkRecuperado[]> {
  if (!useSupabase) return [];
  const texto = (consulta ?? "").trim().slice(0, 1000);
  if (!texto) return [];

  const colecoes = opcoes.colecoes ?? colecoesPara(texto);
  const limite = opcoes.limite ?? 6;
  const vetor = await embeddingDaConsulta(texto);

  // Sem vetor a função SQL não roda (o parâmetro é obrigatório e tipado). Não há como
  // cair só no textual sem duplicar a query — e uma base sem embedding não é o caso de
  // uso normal, é falha de configuração. Melhor devolver vazio e logar.
  if (!vetor) {
    console.error("[rag] sem embedding da consulta — busca ignorada");
    return [];
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc("buscar_chunks", {
      consulta_embedding: vetor,
      consulta_texto: texto,
      colecoes,
      limite,
    });
    if (error) {
      console.error("[rag] buscar_chunks falhou:", error.message);
      return [];
    }
    return (data ?? []) as ChunkRecuperado[];
  } catch (err) {
    console.error("[rag] busca indisponível:", err instanceof Error ? err.message : err);
    return [];
  }
}

// ────────────────────────────────────────────────────── montagem do bloco de contexto

/**
 * Corta a cauda irrelevante. O RRF sempre devolve `limite` linhas, mesmo quando só as
 * duas primeiras têm a ver com a pergunta — e um chunk fraco injetado no prompt não é
 * neutro: o modelo tenta usar o que recebeu. O corte é RELATIVO ao melhor escore porque
 * a escala do RRF (~1/60) não tem um limiar absoluto que signifique alguma coisa.
 */
export const CORTE_RELATIVO = 0.4;

export function filtrarRelevantes(chunks: ChunkRecuperado[]): ChunkRecuperado[] {
  if (!chunks.length) return [];
  const topo = chunks[0].escore;
  if (!(topo > 0)) return [];
  return chunks.filter((c) => c.escore >= topo * CORTE_RELATIVO);
}

/** Como o trecho deve ser citado se a Ana precisar dizer de onde tirou. */
export function citacaoDe(c: ChunkRecuperado): string {
  if (c.artigo) return `${c.diploma || c.documento}, art. ${c.artigo}`;
  const paginas =
    c.pagina_fim && c.pagina_fim !== c.pagina_inicio
      ? `p. ${c.pagina_inicio}-${c.pagina_fim}`
      : `p. ${c.pagina_inicio}`;
  return `${c.documento}, ${paginas}`;
}

/** Teto de caracteres do bloco. Passar disso empurra o histórico da conversa para fora. */
const ORCAMENTO_CARACTERES = 6000;

/**
 * O bloco que vai para o system prompt.
 *
 * Duas coisas aqui não são enfeite:
 *
 * 1. **O alerta de desatualização.** A cartilha do Mercosul (2010) e a de refugiados
 *    (2010) são anteriores à Lei de Migração 13.445/2017 — 151 chunks, 9% do acervo,
 *    descrevendo um regime revogado. Injetar isso sem marcar é o risco jurídico do
 *    item 9 da proposta: a Ana explicaria com segurança uma regra que não vale mais.
 *    Aqui o trecho vai marcado e a instrução manda tratá-lo com ressalva explícita.
 *
 * 2. **A instrução de não citar o que não está no bloco.** Sem ela o modelo completa a
 *    lacuna com o que "sabe" de imigração brasileira, que é exatamente o que o prompt
 *    proíbe e o que ninguém consegue auditar depois.
 */
export function montarBlocoMaterial(chunks: ChunkRecuperado[]): string {
  const relevantes = filtrarRelevantes(chunks);
  if (!relevantes.length) return "";

  const partes: string[] = [];
  let orcamento = ORCAMENTO_CARACTERES;
  let temDesatualizado = false;

  for (const c of relevantes) {
    const cabecalho = c.secao ? `${c.titulo} — ${c.secao}` : c.titulo;
    const alerta = c.alerta_desatualizacao
      ? `\n⚠ MATERIAL DESATUALIZADO: ${c.alerta_desatualizacao}`
      : "";
    if (c.alerta_desatualizacao) temDesatualizado = true;
    const corpo = c.texto.length > orcamento ? c.texto.slice(0, Math.max(0, orcamento)) + "…" : c.texto;
    if (!corpo.trim()) break;
    const parte = `── ${cabecalho}\nFonte: ${citacaoDe(c)}${c.atualizado_em ? ` (atualizado em ${c.atualizado_em})` : ""}${alerta}\n${corpo}`;
    partes.push(parte);
    orcamento -= parte.length;
    if (orcamento <= 200) break;
  }

  if (!partes.length) return "";

  const regraDesatualizado = temDesatualizado
    ? "\nUM DOS TRECHOS ESTÁ MARCADO COMO DESATUALIZADO. Não o use como se valesse hoje: se a resposta depender dele, diga que o material oficial que você tem sobre esse ponto é anterior à legislação atual e que o time jurídico precisa confirmar a regra vigente."
    : "";

  return `\n\n════════ MATERIAL OFICIAL RECUPERADO PARA ESTA PERGUNTA ════════
Estes são os únicos trechos que você tem sobre o assunto. Responda com base neles e com as SUAS palavras — não copie o texto e não leia como quem lê um documento em voz alta.
Se a resposta não estiver aqui, diga que não tem essa informação e ofereça o encaminhamento ao time jurídico. NÃO complete a lacuna com o que você sabe de imigração: número de artigo, prazo, valor de taxa e nome de documento só podem sair do que está escrito abaixo.
Não cite a fonte espontaneamente no meio da conversa — soa a robô lendo cartilha. Tenha a citação à mão para quando a pessoa perguntar de onde veio a informação.
Toda orientação de procedimento sai com a ressalva de que o time jurídico confirma antes de a pessoa agir.${regraDesatualizado}

${partes.join("\n\n")}`;
}

/**
 * A consulta do turno.
 *
 * Buscar só a última mensagem quebra na pergunta de continuação, que é a maioria delas:
 * "e quanto tempo demora?" sozinho não recupera nada, porque o assunto está na mensagem
 * anterior. Quando a última é curta, ela vai junto com a anterior — o assunto volta ao
 * vetor sem que uma conversa inteira dilua a pergunta.
 */
export function consultaDoTurno(mensagensDoCliente: string[]): string {
  const limpas = mensagensDoCliente.map((m) => (m ?? "").trim()).filter(Boolean);
  const ultima = limpas[limpas.length - 1] ?? "";
  if (ultima.length >= 40) return ultima;
  const anterior = limpas[limpas.length - 2];
  return anterior ? `${anterior} ${ultima}`.trim() : ultima;
}

/**
 * Caminho único usado pelo orquestrador: decide se vale buscar, busca e monta o bloco.
 * Nunca lança.
 */
export async function blocoMaterialPara(textoDoCliente: string): Promise<string> {
  if (!ragConfigurado()) return "";
  if (!valeBuscar(textoDoCliente)) return "";
  try {
    const chunks = await buscarChunks(textoDoCliente);
    return montarBlocoMaterial(chunks);
  } catch (err) {
    console.error("[rag] bloco indisponível:", err instanceof Error ? err.message : err);
    return "";
  }
}
