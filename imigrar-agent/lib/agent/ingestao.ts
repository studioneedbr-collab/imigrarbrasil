// INGESTÃO DE PDF PELO PAINEL — a parte que faz o agente realmente aprender.
//
// Acrescentar um documento à LISTA só ensina a Ana que o assunto existe. O que faz ela
// responder é o trecho recuperado a cada mensagem (lib/agent/rag.ts), e trecho só existe se
// alguém quebrar o PDF e vetorizar. Sem este módulo, "adicionar material" seria um rótulo
// novo num acervo que não mudou — o pior tipo de recurso, o que parece funcionar.
//
// O QUE ESTE MÓDULO NÃO É: uma reescrita do pipeline Python em ingestao/. Aquele tem uma
// estratégia por documento, feita à mão — um trecho por `Art. N` na legislação, um por
// pergunta nas cartilhas da DPU, um mapa manual de seções para a cartilha de visto. Isso
// não se reproduz aqui e não deve: os sete documentos do código continuam sendo dele.
// Documento novo entra pela estratégia GENÉRICA (janela de parágrafos com sobreposição),
// que é a mesma que o `chunk.py` já usa para Mercosul, refúgio e doutrina.
//
// TUDO AQUI PODE FALHAR SEM DERRUBAR NADA: quem chama é uma rota de painel, e o atendimento
// não depende deste caminho. O que não pode acontecer é documento pela metade na base — ver
// `indexarDocumento`.

import { createHash } from "node:crypto";
import { createServerClient } from "@/lib/supabase/client";
import { embeddingsDeLote, type Colecao } from "@/lib/agent/rag";

/* ------------------------------------------------------------------ */
/* Extração                                                            */
/* ------------------------------------------------------------------ */

export interface TextoExtraido {
  paginas: string[];
  caracteres: number;
}

/**
 * MÍNIMO DE TEXTO PARA O DOCUMENTO SER ACEITO.
 *
 * PDF escaneado não tem camada de texto: a extração devolve praticamente nada, os trechos
 * saem vazios e o documento entra na base sem nunca ser recuperado por busca nenhuma. É o
 * problema que a cartilha de visto já tem com as divisórias rasterizadas. Aceitar em
 * silêncio criaria a pior situação possível — a tela diz que o material está lá, a Ana diz
 * que cobre o assunto, e não há uma linha indexada.
 */
export const MINIMO_CARACTERES = 400;

/** Texto por página, via unpdf (pdf.js empacotado para serverless, sem binário nativo). */
export async function extrairTexto(bytes: Uint8Array): Promise<TextoExtraido> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  const paginas = (Array.isArray(text) ? text : [text]).map((p) => limpar(p ?? ""));
  return { paginas, caracteres: paginas.join("").length };
}

/**
 * Limpeza mínima. Não tenta consertar o que o layout justificado quebrou ("apr esente"):
 * a extração do pipeline Python também deixa isso passar, é raro e não atrapalha a busca.
 * O que atrapalha e se conserta aqui é hifenização de fim de linha e espaço em excesso.
 */
function limpar(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/([a-zà-ÿ])-\n([a-zà-ÿ])/gi, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Quebra em trechos                                                   */
/* ------------------------------------------------------------------ */

export interface Trecho {
  texto: string;
  paginaInicio: number;
  paginaFim: number;
  ordem: number;
}

/**
 * Os números vêm da base que já está no ar (ver ingestao/README.md): nenhum trecho abaixo
 * de 180 caracteres, nenhum acima de ~2.340, mediana 1.207. Manter a mesma faixa importa
 * porque a recuperação é híbrida e comparativa — trecho muito maior que os vizinhos ganha
 * a busca textual por volume, não por pertinência.
 */
const MIN_TRECHO = 180;
const ALVO_TRECHO = 1200;
const MAX_TRECHO = 2340;

/**
 * TETO DE TRECHOS POR DOCUMENTO.
 *
 * Existe por causa do tempo de requisição, não por limite da base. Vetorizar 400 trechos são
 * poucos lotes e cabe no tempo da função; um PDF de mil páginas estouraria no meio e
 * deixaria a base com metade do documento. Melhor recusar com o número na tela e pedir para
 * dividir o arquivo do que aceitar e quebrar no meio.
 */
export const MAX_TRECHOS = 400;

/**
 * Janela de parágrafos com sobreposição de um parágrafo. A sobreposição existe porque a
 * resposta a uma pergunta quase nunca começa no início do parágrafo: sem ela, um trecho que
 * abre em "Sim, desde que a pessoa comprove..." perde a pergunta que ele responde.
 *
 * Nunca corta no meio de um parágrafo — a não ser que o parágrafo sozinho passe do máximo,
 * caso em que ele é fatiado por frase.
 */
export function quebrarEmTrechos(paginas: string[]): Trecho[] {
  // Cada parágrafo carrega a página em que começou: é o que permite citar "página 12".
  const paragrafos: { texto: string; pagina: number }[] = [];
  paginas.forEach((pagina, i) => {
    for (const bruto of pagina.split(/\n\s*\n/)) {
      const texto = bruto.trim();
      if (texto) paragrafos.push({ texto, pagina: i + 1 });
    }
  });

  const trechos: Trecho[] = [];
  let atual: { texto: string; pagina: number }[] = [];
  let tamanho = 0;

  const fechar = () => {
    if (!atual.length) return;
    const texto = atual.map((p) => p.texto).join("\n\n");
    if (texto.length >= MIN_TRECHO || trechos.length === 0) {
      trechos.push({
        texto,
        paginaInicio: atual[0].pagina,
        paginaFim: atual[atual.length - 1].pagina,
        ordem: trechos.length,
      });
      // Sobreposição: o último parágrafo abre o trecho seguinte.
      const ultimo = atual[atual.length - 1];
      atual = ultimo.texto.length < ALVO_TRECHO ? [ultimo] : [];
      tamanho = atual.reduce((s, p) => s + p.texto.length, 0);
      return;
    }
    // Trecho curto demais para valer sozinho: fica grudado no anterior, se houver.
    const anterior = trechos[trechos.length - 1];
    if (anterior) {
      anterior.texto = `${anterior.texto}\n\n${texto}`.slice(0, MAX_TRECHO);
      anterior.paginaFim = atual[atual.length - 1].pagina;
    }
    atual = [];
    tamanho = 0;
  };

  for (const p of paragrafos) {
    // Parágrafo gigante (tabela colada, página sem quebra): fatia por frase.
    if (p.texto.length > MAX_TRECHO) {
      fechar();
      for (const pedaco of fatiarPorFrase(p.texto)) {
        trechos.push({
          texto: pedaco,
          paginaInicio: p.pagina,
          paginaFim: p.pagina,
          ordem: trechos.length,
        });
      }
      continue;
    }
    if (tamanho + p.texto.length > MAX_TRECHO && atual.length) fechar();
    atual.push(p);
    tamanho += p.texto.length + 2;
    if (tamanho >= ALVO_TRECHO) fechar();
  }
  fechar();

  return trechos.map((t, i) => ({ ...t, ordem: i }));
}

function fatiarPorFrase(texto: string): string[] {
  const frases = texto.split(/(?<=[.!?])\s+/);
  const saida: string[] = [];
  let buffer = "";
  for (const f of frases) {
    if (buffer.length + f.length > MAX_TRECHO && buffer) {
      saida.push(buffer.trim());
      buffer = "";
    }
    buffer += `${f} `;
  }
  if (buffer.trim()) saida.push(buffer.trim());
  return saida;
}

/* ------------------------------------------------------------------ */
/* Indexação                                                           */
/* ------------------------------------------------------------------ */

export interface DadosDoDocumento {
  fonte: string;
  documento: string;
  titulo: string;
  colecao: Colecao;
  atualizadoEm?: string;
}

export type ResultadoIndexacao =
  | { ok: true; trechos: number }
  | { ok: false; erro: string };

/** Lote de vetorização. 64 por chamada mantém o corpo da requisição em tamanho razoável. */
const LOTE = 64;

/**
 * O prefixo de contexto é o que faz a recuperação funcionar.
 *
 * Sem ele, um trecho que começa em "Sim, desde que a pessoa comprove..." não recupera nada:
 * o vetor não tem uma única palavra do assunto. Mesma decisão do `texto_embed` do pipeline
 * Python — documento, seção e título antes do corpo.
 */
function textoParaVetor(d: DadosDoDocumento, t: Trecho): string {
  return `${d.documento} — ${d.titulo} — página ${t.paginaInicio}\n\n${t.texto}`;
}

/**
 * Indexa o documento inteiro em rag_chunks.
 *
 * TUDO OU NADA, e é a decisão mais importante daqui: se um lote de vetores falha, a função
 * apaga o que já gravou e devolve erro. Documento pela metade não dá erro visível — dá busca
 * que encontra parte do assunto, e ninguém descobre olhando o resultado. Ver `apagarTrechos`.
 */
export async function indexarDocumento(
  d: DadosDoDocumento,
  trechos: Trecho[],
): Promise<ResultadoIndexacao> {
  if (trechos.length === 0) return { ok: false, erro: "Nenhum trecho a indexar." };
  if (trechos.length > MAX_TRECHOS) {
    return {
      ok: false,
      erro: `O documento gerou ${trechos.length} trechos e o limite é ${MAX_TRECHOS}. Divida o PDF em partes menores.`,
    };
  }

  const supabase = createServerClient();

  // Reindexação limpa: os ids são derivados do conteúdo, então um upsert sozinho deixaria os
  // trechos da versão ANTIGA na base — respondendo com texto que não está mais no PDF. O
  // README do pipeline registra o mesmo cuidado.
  await apagarTrechos(d.fonte);

  let gravados = 0;
  try {
    for (let i = 0; i < trechos.length; i += LOTE) {
      const lote = trechos.slice(i, i + LOTE);
      const textos = lote.map((t) => textoParaVetor(d, t));
      const vetores = await embeddingsDeLote(textos);
      if (!vetores) {
        await apagarTrechos(d.fonte);
        return {
          ok: false,
          erro: "Falha ao gerar os vetores do documento. Nada foi indexado — tente de novo.",
        };
      }
      const linhas = lote.map((t, j) => ({
        id: idDoTrecho(d.fonte, t),
        fonte: d.fonte,
        documento: d.documento,
        colecao: d.colecao,
        titulo: d.titulo,
        secao: null,
        temas: [],
        idioma: "pt",
        atualizado_em: d.atualizadoEm ?? null,
        pagina_inicio: t.paginaInicio,
        pagina_fim: t.paginaFim,
        ordem: t.ordem,
        texto: t.texto,
        texto_embed: textos[j],
        embedding: vetores[j],
      }));
      const { error } = await supabase.from("rag_chunks").upsert(linhas, { onConflict: "id" });
      if (error) {
        await apagarTrechos(d.fonte);
        return { ok: false, erro: `Falha ao gravar os trechos: ${error.message}` };
      }
      gravados += linhas.length;
    }
    return { ok: true, trechos: gravados };
  } catch (err) {
    await apagarTrechos(d.fonte).catch(() => {});
    return {
      ok: false,
      erro: err instanceof Error ? err.message : "Falha desconhecida ao indexar.",
    };
  }
}

/** id derivado do conteúdo — o mesmo trecho reindexado substitui em vez de duplicar. */
function idDoTrecho(fonte: string, t: Trecho): string {
  const hash = createHash("sha1").update(`${fonte}|${t.ordem}|${t.texto}`).digest("hex");
  return `${fonte}:${t.ordem}:${hash.slice(0, 12)}`;
}

/**
 * Apaga os trechos de uma fonte.
 *
 * Sem isto, remover um documento do acervo o tiraria da LISTA e o deixaria na BUSCA: a Ana
 * não saberia que ele existe e continuaria recebendo trechos dele para responder — uma
 * cartilha revogada respondendo sem ninguém ver. É o pior estado dos dois lados.
 */
export async function apagarTrechos(fonte: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from("rag_chunks").delete().eq("fonte", fonte);
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Falha ao apagar trechos." };
  }
}

/** Quantos trechos uma fonte tem na base. A tela usa para mostrar o que está indexado. */
export async function contarTrechos(fonte: string): Promise<number | null> {
  try {
    const supabase = createServerClient();
    const { count, error } = await supabase
      .from("rag_chunks")
      .select("id", { count: "exact", head: true })
      .eq("fonte", fonte);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}
