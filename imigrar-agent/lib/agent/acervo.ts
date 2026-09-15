// O ACERVO EDITÁVEL — o que a equipe acrescenta e remove em /dashboard/treinar.
//
// Até aqui o acervo eram sete PDFs escritos à mão em lib/agent/material-oficial.ts, e
// trocar um deles era tarefa de desenvolvedor com Python e poppler na máquina. Este módulo
// dá ao acervo a mesma natureza que o resto do treinamento já tinha: uma lista do código
// como padrão, e o que está no banco por cima.
//
// SÃO DUAS CHAVES, e não uma lista só:
//
//   material_oficial_extra      o que foi ACRESCENTADO pelo painel
//   material_oficial_removidos  quais dos SETE DO CÓDIGO foram tirados
//
// Duas porque os documentos do código continuam no repositório e no pipeline Python. Se a
// remoção fosse "reescrever a lista inteira no banco", um deploy futuro que mexesse na
// constante do código ficaria em contradição silenciosa com o banco. Marcar o que saiu
// mantém a constante como fonte do que EXISTE e o banco como fonte do que VALE.

import { getRepository } from "@/lib/data";
import { MATERIAIS, type MaterialOficial } from "@/lib/agent/material-oficial";

/**
 * TETO DE TAMANHO DO PDF — 4 MB.
 *
 * O número não é estético: o corpo de uma requisição na Vercel para em 4,5 MB, e um upload
 * que passa disso é recusado pela plataforma ANTES de chegar ao nosso código, o que vira um
 * erro de rede sem mensagem para quem está na tela. 4 MB deixa a folga do envelope
 * multipart e permite recusar com uma frase em português, dizendo o tamanho do arquivo.
 *
 * Consequência que precisa ser dita: `refugiados-no-brasil.pdf` (5,7 MB) NÃO caberia por
 * aqui. Substituir aquela cartilha específica continua passando pelo pipeline Python —
 * ou por um PDF comprimido/dividido.
 */
export const MATERIAL_MAX_BYTES = 4 * 1024 * 1024;
export const MATERIAL_MAX_MB = MATERIAL_MAX_BYTES / (1024 * 1024);

/** Um documento acrescentado pelo painel. `arquivo` é a identidade — e a `fonte` dos trechos. */
export interface MaterialAdicionado extends MaterialOficial {
  /** Chave dos trechos em rag_chunks.fonte. Derivada do nome do arquivo. */
  fonte: string;
  /** Mês/ano que a equipe informou. Vai no metadado do trecho e na tela. */
  atualizadoEm: string;
  paginas: number;
  caracteres: number;
  trechos: number;
  criadoEm: string;
  /** Quem subiu — o acervo é o que sustenta o que a Ana afirma; rastro importa. */
  porEmail?: string;
}

const CHAVE_EXTRA = "material_oficial_extra";
const CHAVE_REMOVIDOS = "material_oficial_removidos";

/** `slug` a partir do nome do arquivo: é o que vira `fonte` e identifica os trechos. */
export function fonteDoArquivo(nome: string): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.pdf$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function normalizarAdicionado(raw: unknown): MaterialAdicionado | null {
  const m = (raw ?? {}) as Partial<MaterialAdicionado>;
  if (!m.arquivo || !m.titulo) return null;
  const colecao =
    m.colecao === "legislacao" || m.colecao === "doutrina" ? m.colecao : "cartilha";
  return {
    arquivo: m.arquivo,
    titulo: m.titulo,
    cobre: typeof m.cobre === "string" ? m.cobre : "",
    colecao,
    fonte: m.fonte || fonteDoArquivo(m.arquivo),
    atualizadoEm: typeof m.atualizadoEm === "string" ? m.atualizadoEm : "",
    paginas: Number(m.paginas) || 0,
    caracteres: Number(m.caracteres) || 0,
    trechos: Number(m.trechos) || 0,
    criadoEm: typeof m.criadoEm === "string" ? m.criadoEm : new Date().toISOString(),
    porEmail: typeof m.porEmail === "string" ? m.porEmail : undefined,
  };
}

export async function listarAdicionados(): Promise<MaterialAdicionado[]> {
  const raw = await getRepository().getConfig<unknown[]>(CHAVE_EXTRA);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizarAdicionado).filter((m): m is MaterialAdicionado => !!m);
}

export async function listarRemovidos(): Promise<string[]> {
  const raw = await getRepository().getConfig<unknown[]>(CHAVE_REMOVIDOS);
  if (!Array.isArray(raw)) return [];
  return raw.filter((a): a is string => typeof a === "string" && !!a);
}

/**
 * O ACERVO QUE VALE: os sete do código, menos os removidos, mais os acrescentados.
 *
 * É esta lista que entra no prompt, que a tela mostra e que o mapa desenha. Qualquer lugar
 * que continue lendo a constante `MATERIAIS` direto passa a mentir no dia em que alguém
 * remover um documento — ver a varredura em docs/.
 */
export async function listarAcervo(): Promise<{
  documentos: MaterialOficial[];
  adicionados: MaterialAdicionado[];
  removidos: string[];
}> {
  const [adicionados, removidos] = await Promise.all([listarAdicionados(), listarRemovidos()]);
  const doCodigo = MATERIAIS.filter((m) => !removidos.includes(m.arquivo));

  // DEDUPLICAR POR ARQUIVO, e o do banco vence.
  //
  // O caso que obriga isto: alguém remove uma cartilha do código e depois sobe a versão nova
  // com o MESMO nome de arquivo. Salvar desfaz a remoção (senão o documento entraria no
  // banco e continuaria fora do acervo), e sem esta junção o resultado eram duas entradas do
  // mesmo documento — linha repetida no prompt e chave repetida na lista da tela. Quem vence
  // é a do banco porque ela descreve o PDF que foi realmente indexado.
  const porArquivo = new Map<string, MaterialOficial>();
  for (const m of doCodigo) porArquivo.set(m.arquivo.toLowerCase(), m);
  for (const m of adicionados) porArquivo.set(m.arquivo.toLowerCase(), m);

  // Array.from e não spread: o alvo de compilação do projeto não itera Map sem
  // --downlevelIteration (mesmo motivo do comentário sobre a flag `u` em rag.ts).
  return { documentos: Array.from(porArquivo.values()), adicionados, removidos };
}

/** Só a lista, para quem monta o prompt. Degrada para os sete do código se o banco falhar. */
export async function acervoDoPrompt(): Promise<MaterialOficial[]> {
  try {
    return (await listarAcervo()).documentos;
  } catch (err) {
    console.error("[acervo] leitura falhou:", err instanceof Error ? err.message : err);
    return MATERIAIS;
  }
}

/** O documento já está no acervo (no código ou no banco)? */
export async function jaExiste(arquivo: string): Promise<boolean> {
  const { documentos } = await listarAcervo();
  const alvo = arquivo.toLowerCase();
  return documentos.some((d) => d.arquivo.toLowerCase() === alvo);
}

export async function salvarAdicionado(m: MaterialAdicionado): Promise<void> {
  const atuais = await listarAdicionados();
  const semDuplicata = atuais.filter((x) => x.arquivo.toLowerCase() !== m.arquivo.toLowerCase());
  await getRepository().setConfig(CHAVE_EXTRA, [...semDuplicata, m]);
  // Re-adicionar um documento que havia sido removido tem de desfazer a remoção, senão ele
  // entra no banco e continua fora do acervo.
  const removidos = await listarRemovidos();
  if (removidos.includes(m.arquivo)) {
    await getRepository().setConfig(
      CHAVE_REMOVIDOS,
      removidos.filter((a) => a !== m.arquivo),
    );
  }
}

export type ResultadoRemocao =
  | { ok: true; tipo: "adicionado" | "codigo"; fonte: string }
  | { ok: false; erro: string };

/**
 * Tira um documento do acervo.
 *
 * Documento do código vai para a lista de removidos; documento acrescentado sai da lista de
 * extras. Em nenhum dos dois casos esta função apaga os TRECHOS — quem faz isso é
 * lib/agent/ingestao.ts, e a rota chama os dois na ordem. Separado de propósito: apagar
 * trecho é irreversível e mexe no Supabase, enquanto isto aqui é só a lista.
 */
export async function removerDoAcervo(arquivo: string): Promise<ResultadoRemocao> {
  const repo = getRepository();
  const adicionados = await listarAdicionados();
  const achado = adicionados.find((x) => x.arquivo.toLowerCase() === arquivo.toLowerCase());
  if (achado) {
    await repo.setConfig(
      CHAVE_EXTRA,
      adicionados.filter((x) => x.arquivo.toLowerCase() !== arquivo.toLowerCase()),
    );
    return { ok: true, tipo: "adicionado", fonte: achado.fonte };
  }

  const doCodigo = MATERIAIS.find((m) => m.arquivo === arquivo);
  if (!doCodigo) return { ok: false, erro: "Documento não encontrado no acervo." };

  const removidos = await listarRemovidos();
  if (!removidos.includes(arquivo)) {
    await repo.setConfig(CHAVE_REMOVIDOS, [...removidos, arquivo]);
  }
  return { ok: true, tipo: "codigo", fonte: fonteDoArquivo(arquivo) };
}

/** Desfaz a remoção de um documento do código. Os trechos dele precisam ser reindexados. */
export async function restaurarDoCodigo(arquivo: string): Promise<void> {
  const removidos = await listarRemovidos();
  await getRepository().setConfig(
    CHAVE_REMOVIDOS,
    removidos.filter((a) => a !== arquivo),
  );
}
