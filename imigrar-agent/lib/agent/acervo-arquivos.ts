// OS PDFs EM SI — guardar e devolver.
//
// O upload pelo painel nasceu extraindo o texto, indexando e DESCARTANDO o arquivo: para o
// agente responder, só o trecho vetorizado importa. Mas para uma pessoa conferir o que está
// na base — ou mandar a cartilha para um cliente — o PDF precisa existir em algum lugar.
//
// SÃO DUAS ORIGENS, e a ordem é sempre a mesma:
//
//   1. Supabase Storage       a fonte de verdade do acervo
//   2. material-oficial/      o repositório: semente e rede de segurança
//
// O Supabase vem primeiro porque é o único lugar onde o acervo é o mesmo para todo mundo, o
// tempo todo. O repositório é um estado congelado no commit: não recebe o que a equipe sobe,
// não muda entre deploys e some de qualquer ambiente onde a pasta não tenha sido empacotada.
// Ele serve para duas coisas — semear o storage na primeira sincronização
// (`sincronizarComStorage`) e continuar respondendo se o storage estiver fora do ar.
//
// POR QUE NÃO URL ASSINADA DO SUPABASE: seria mais simples e tiraria o tráfego da nossa
// função, mas a CSP deste painel é `connect-src 'self'` e o comentário do next.config é
// explícito — o front nunca fala com o Supabase direto, tudo passa pelas rotas. Um painel
// interno com PII de cliente não começa a distribuir link de storage de terceiro por
// conveniência de download.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServerClient } from "@/lib/supabase/client";
import { useSupabase } from "@/lib/env";

export const BUCKET = "material-oficial";

/**
 * A pasta dos sete, na raiz do repositório — um nível acima de imigrar-agent/.
 *
 * Em produção esses arquivos só existem dentro da função porque o next.config os inclui
 * explicitamente (outputFileTracingIncludes): o Next não rastreia leitura de arquivo por
 * caminho montado em runtime, então sem aquela entrada o download dos sete responderia 404
 * só na Vercel — funcionando perfeitamente na máquina de quem programou.
 */
const PASTA_DO_CODIGO = path.join(process.cwd(), "..", "material-oficial");

/**
 * NOME DE ARQUIVO SEGURO.
 *
 * O nome chega por query string e vira caminho em disco. Sem esta checagem,
 * `?arquivo=../../.env.local` leria o que não devia — é travessia de diretório clássica, e
 * numa rota autenticada de painel interno continua sendo vazamento. A regra é positiva (só
 * o que eu aceito), nunca uma lista do que eu recuso.
 */
export function nomeSeguro(nome: string): string | null {
  const limpo = (nome ?? "").trim();
  if (!limpo || limpo.length > 120) return null;
  if (!/^[A-Za-z0-9._-]+\.pdf$/i.test(limpo)) return null;
  if (limpo.includes("..")) return null;
  return limpo;
}

/** O bucket existe? Cria na primeira vez, privado. Silencioso se já existir. */
async function garantirBucket(): Promise<void> {
  const supabase = createServerClient();
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (data) return;
  await supabase.storage.createBucket(BUCKET, { public: false });
}

/** Guarda o PDF subido pelo painel. Falha aqui NÃO invalida a indexação — ver a rota. */
export async function guardarPdf(
  arquivo: string,
  bytes: Uint8Array,
): Promise<{ ok: boolean; erro?: string }> {
  const nome = nomeSeguro(arquivo);
  if (!nome) return { ok: false, erro: "Nome de arquivo inválido." };
  if (!useSupabase) return { ok: false, erro: "Supabase não configurado." };
  try {
    await garantirBucket();
    const supabase = createServerClient();
    const { error } = await supabase.storage.from(BUCKET).upload(nome, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Falha ao guardar o PDF." };
  }
}

export async function apagarPdf(arquivo: string): Promise<void> {
  const nome = nomeSeguro(arquivo);
  if (!nome || !useSupabase) return;
  try {
    await createServerClient().storage.from(BUCKET).remove([nome]);
  } catch (err) {
    // Arquivo órfão no storage é lixo, não risco: ele não entra no prompt nem na busca.
    console.error("[acervo-arquivos] falha ao apagar:", err instanceof Error ? err.message : err);
  }
}

export type OrigemDoArquivo = "storage" | "repositorio" | "ausente";

export type PdfLido =
  | { ok: true; bytes: Uint8Array; origem: "storage" | "repositorio" }
  | { ok: false; erro: string };

/**
 * O STORAGE VEM PRIMEIRO, SEMPRE.
 *
 * Não é só sobre a versão nova de um arquivo com o mesmo nome. O repositório é um estado
 * CONGELADO no commit: ele não muda entre deploys, não recebe o que a equipe sobe e some de
 * qualquer ambiente onde a pasta não tenha sido empacotada. O Supabase é o único lugar onde
 * o acervo é o mesmo para todo mundo, o tempo todo. Então a ordem é Supabase, e o
 * repositório é o que resta — semente para a primeira sincronização e rede se o storage
 * estiver fora.
 */
export async function lerPdf(arquivo: string): Promise<PdfLido> {
  const nome = nomeSeguro(arquivo);
  if (!nome) return { ok: false, erro: "Nome de arquivo inválido." };

  if (useSupabase) {
    try {
      const { data } = await createServerClient().storage.from(BUCKET).download(nome);
      // `size > 0` e não só `data`: um objeto truncado por upload interrompido volta como
      // blob vazio, e servir zero byte como se fosse o PDF é pior do que cair na cópia do
      // repositório, que pelo menos abre.
      if (data && data.size > 0) {
        return { ok: true, bytes: new Uint8Array(await data.arrayBuffer()), origem: "storage" };
      }
    } catch {
      // Segue para o repositório — é o esperado até a primeira sincronização.
    }
  }

  try {
    const bytes = await readFile(path.join(PASTA_DO_CODIGO, nome));
    return { ok: true, bytes: new Uint8Array(bytes), origem: "repositorio" };
  } catch {
    return {
      ok: false,
      erro:
        "O PDF não está disponível para download. Documentos subidos antes desta versão do painel não foram guardados — suba o arquivo de novo para poder baixá-lo.",
    };
  }
}

/** Os nomes que já estão no bucket. Vazio se o storage não estiver disponível. */
export async function listarNoStorage(): Promise<Set<string>> {
  if (!useSupabase) return new Set();
  try {
    const { data, error } = await createServerClient()
      .storage.from(BUCKET)
      .list("", { limit: 1000 });
    if (error || !data) return new Set();
    return new Set(data.filter((o) => (o.metadata?.size ?? 1) > 0).map((o) => o.name.toLowerCase()));
  } catch {
    return new Set();
  }
}

/**
 * Onde cada documento do acervo tem o arquivo hoje.
 *
 * A tela mostra isso porque a diferença é operacional, não decorativa: o que está só no
 * repositório desaparece de qualquer ambiente que não tenha a pasta empacotada, e é
 * exatamente o que a sincronização resolve.
 */
export async function origemDosArquivos(
  arquivos: string[],
): Promise<Record<string, OrigemDoArquivo>> {
  const noStorage = await listarNoStorage();
  const saida: Record<string, OrigemDoArquivo> = {};
  for (const arquivo of arquivos) {
    const nome = nomeSeguro(arquivo);
    if (!nome) {
      saida[arquivo] = "ausente";
      continue;
    }
    if (noStorage.has(nome.toLowerCase())) {
      saida[arquivo] = "storage";
      continue;
    }
    try {
      await readFile(path.join(PASTA_DO_CODIGO, nome));
      saida[arquivo] = "repositorio";
    } catch {
      saida[arquivo] = "ausente";
    }
  }
  return saida;
}

export interface ResultadoSincronizacao {
  enviados: string[];
  jaEstavam: string[];
  semArquivo: string[];
  falhas: { arquivo: string; erro: string }[];
}

/**
 * Manda para o Supabase o que ainda só existe no repositório.
 *
 * É a operação que tira os sete originais de dentro do deploy e os coloca onde o resto do
 * acervo já vive. Idempotente de propósito — rodar duas vezes não reenvia nada, porque
 * reenviar sobrescreveria com a cópia congelada do commit uma versão que alguém pode ter
 * subido pelo painel.
 */
export async function sincronizarComStorage(arquivos: string[]): Promise<ResultadoSincronizacao> {
  const resultado: ResultadoSincronizacao = {
    enviados: [],
    jaEstavam: [],
    semArquivo: [],
    falhas: [],
  };
  const noStorage = await listarNoStorage();

  for (const arquivo of arquivos) {
    const nome = nomeSeguro(arquivo);
    if (!nome) {
      resultado.semArquivo.push(arquivo);
      continue;
    }
    if (noStorage.has(nome.toLowerCase())) {
      resultado.jaEstavam.push(arquivo);
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(path.join(PASTA_DO_CODIGO, nome)));
    } catch {
      resultado.semArquivo.push(arquivo);
      continue;
    }
    const guardado = await guardarPdf(nome, bytes);
    if (guardado.ok) resultado.enviados.push(arquivo);
    else resultado.falhas.push({ arquivo, erro: guardado.erro ?? "falha desconhecida" });
  }

  return resultado;
}
