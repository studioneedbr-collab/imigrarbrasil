import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireSession } from "@/lib/auth/guard";
import { REGRAS_INVIOLAVEIS, MATERIAIS } from "@/lib/agent/material-oficial";
import {
  MATERIAL_MAX_BYTES,
  MATERIAL_MAX_MB,
  fonteDoArquivo,
  jaExiste,
  listarAcervo,
  removerDoAcervo,
  salvarAdicionado,
  type MaterialAdicionado,
} from "@/lib/agent/acervo";
import {
  MAX_TRECHOS,
  MINIMO_CARACTERES,
  apagarTrechos,
  extrairTexto,
  indexarDocumento,
  quebrarEmTrechos,
} from "@/lib/agent/ingestao";
import { ragConfigurado } from "@/lib/agent/rag";
import { apagarPdf, guardarPdf, origemDosArquivos } from "@/lib/agent/acervo-arquivos";
import { useSupabase } from "@/lib/env";

export const dynamic = "force-dynamic";

// Vetorizar algumas centenas de trechos não cabe no tempo padrão de uma função. O teto de
// trechos (MAX_TRECHOS) é o outro lado desta conta: os dois juntos é que garantem que o
// documento termina de indexar dentro de uma requisição, em vez de morrer no meio.
export const maxDuration = 300;

/**
 * O ACERVO — ler é para qualquer sessão, mexer é só para administrador.
 *
 * A assimetria é deliberada e foi pedida: o acervo é o que sustenta tudo que a Ana afirma a
 * quem está do outro lado. Quem atende precisa VER qual documento responde o quê (é o que
 * evita prometer resposta sobre tema que a base não cobre); trocar a base jurídica do
 * escritório é outra ordem de decisão.
 */
export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const { documentos, adicionados, removidos } = await listarAcervo();
  // Onde cada PDF está hoje. É uma listagem do bucket, não uma chamada por documento.
  const arquivos = await origemDosArquivos(documentos.map((d) => d.arquivo));

  return NextResponse.json({
    regras: REGRAS_INVIOLAVEIS,
    documentos,
    adicionados,
    removidos,
    doCodigo: MATERIAIS.map((m) => m.arquivo),
    limiteBytes: MATERIAL_MAX_BYTES,
    limiteMb: MATERIAL_MAX_MB,
    maxTrechos: MAX_TRECHOS,
    // Sem provedor de embeddings ou sem Supabase não há como indexar. A tela precisa dizer
    // isso ANTES de alguém subir um PDF de 4 MB e receber um erro no fim.
    indexacaoDisponivel: ragConfigurado(),
    podeEditar: auth.session.role === "admin",
    arquivos,
    storageDisponivel: useSupabase,
    // Quantos ainda vivem só dentro do deploy: é o que o botão de sincronizar resolve.
    soNoRepositorio: Object.values(arquivos).filter((o) => o === "repositorio").length,
  });
}

const COLECOES = ["cartilha", "legislacao", "doutrina"] as const;

/** Acrescenta um documento: recebe o PDF, extrai, quebra, vetoriza, grava e só então lista. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  if (!ragConfigurado()) {
    return NextResponse.json(
      {
        error:
          "A indexação não está disponível: falta o Supabase ou a chave de embeddings. Sem isso o documento entraria na lista sem o agente conseguir ler nada dele.",
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      {
        error: `Não consegui ler o arquivo. Se ele passa de ${MATERIAL_MAX_MB} MB, a plataforma recusa antes de chegar aqui — comprima ou divida o PDF.`,
      },
      { status: 413 },
    );
  }

  const arquivo = form.get("arquivo");
  const titulo = String(form.get("titulo") ?? "").trim();
  const cobre = String(form.get("cobre") ?? "").trim();
  const colecaoRaw = String(form.get("colecao") ?? "cartilha");
  const atualizadoEm = String(form.get("atualizadoEm") ?? "").trim();

  if (!(arquivo instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  if (!titulo) {
    return NextResponse.json({ error: "Dê um título ao documento." }, { status: 400 });
  }
  if (!cobre) {
    return NextResponse.json(
      {
        error:
          "Escreva o que este documento cobre. É essa frase que a Ana lê para saber quando usá-lo — sem ela, o documento é indexado e nunca oferecido.",
      },
      { status: 400 },
    );
  }
  const colecao = (COLECOES as readonly string[]).includes(colecaoRaw)
    ? (colecaoRaw as (typeof COLECOES)[number])
    : "cartilha";

  // O NOME É NORMALIZADO NA ENTRADA, e não aproveitado como veio.
  //
  // "Reunião Familiar (2).pdf" é um nome de arquivo perfeitamente normal para quem sobe, e
  // ele é três coisas aqui dentro: chave no storage, `fonte` dos trechos e parâmetro de uma
  // URL de download. O filtro do download (nomeSeguro) só aceita nome sem acento, sem espaço
  // e sem parêntese — então guardar o nome original produziria um documento indexado, com
  // trechos certos, que responde 404 quando alguém clica em Baixar. Canonizar aqui, uma vez,
  // é o que mantém os três usos coerentes.
  const fonte = fonteDoArquivo(arquivo.name);
  if (!fonte) {
    return NextResponse.json(
      { error: "Não consegui derivar um nome válido do arquivo. Renomeie o PDF e tente de novo." },
      { status: 400 },
    );
  }
  const nome = `${fonte}.pdf`;

  if (arquivo.type && arquivo.type !== "application/pdf") {
    return NextResponse.json({ error: "Só PDF, por enquanto." }, { status: 415 });
  }
  if (arquivo.size > MATERIAL_MAX_BYTES) {
    const mb = (arquivo.size / 1024 / 1024).toFixed(1);
    return NextResponse.json(
      { error: `O arquivo tem ${mb} MB e o limite é ${MATERIAL_MAX_MB} MB. Comprima ou divida o PDF.` },
      { status: 413 },
    );
  }
  if (await jaExiste(nome)) {
    return NextResponse.json(
      { error: `Já existe um documento chamado ${nome} no acervo. Remova o antigo antes de subir a versão nova.` },
      { status: 409 },
    );
  }

  // ── Extração ──
  // Os bytes ficam numa variável porque servem a duas coisas: extrair o texto agora e ser
  // guardados para download depois. Ler o File duas vezes seria o dobro de memória.
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  let paginas: string[];
  let caracteres: number;
  try {
    const extraido = await extrairTexto(bytes);
    paginas = extraido.paginas;
    caracteres = extraido.caracteres;
  } catch (err) {
    console.error("[material-oficial:POST] extração falhou:", err);
    return NextResponse.json(
      { error: "Não consegui ler o texto deste PDF. Ele pode estar corrompido ou protegido." },
      { status: 422 },
    );
  }

  // PDF ESCANEADO É O CASO QUE PRECISA DE RECUSA, não de aviso: aceito, ele ocupa uma linha
  // na tela, entra no prompt como assunto coberto, e não tem um único trecho recuperável.
  if (caracteres < MINIMO_CARACTERES) {
    return NextResponse.json(
      {
        error: `Este PDF só rendeu ${caracteres} caracteres de texto — provavelmente é escaneado (imagem, sem camada de texto). Do jeito que está, o agente não conseguiria ler nada dele. Suba uma versão com texto selecionável.`,
      },
      { status: 422 },
    );
  }

  const trechos = quebrarEmTrechos(paginas);

  const indexado = await indexarDocumento(
    { fonte, documento: titulo, titulo, colecao, atualizadoEm: atualizadoEm || undefined },
    trechos,
  );
  if (!indexado.ok) {
    return NextResponse.json({ error: indexado.erro }, { status: 422 });
  }

  // ── Guardar o PDF, para o download ──
  //
  // DEPOIS de indexar e SEM desfazer nada se falhar, porque as duas coisas têm pesos
  // diferentes: sem trecho vetorizado o agente não aprende (e aí a inclusão inteira é
  // inútil); sem o arquivo guardado, ele aprende e alguém não consegue baixar o PDF depois.
  // Recusar a inclusão por causa da segunda seria jogar fora a primeira. O aviso vai na
  // resposta.
  const guardado = await guardarPdf(nome, bytes);

  // A LISTA SÓ DEPOIS DA INDEXAÇÃO. Na ordem inversa, uma falha de vetorização deixaria o
  // documento visível na tela e no prompt sem nada na base — a Ana ofereceria um material
  // que não existe.
  const novo: MaterialAdicionado = {
    arquivo: nome,
    titulo,
    cobre,
    colecao,
    fonte,
    atualizadoEm,
    paginas: paginas.length,
    caracteres,
    trechos: indexado.trechos,
    criadoEm: new Date().toISOString(),
    porEmail: auth.session.email,
  };
  await salvarAdicionado(novo);

  const acervo = await listarAcervo();
  return NextResponse.json({
    ok: true,
    adicionado: novo,
    avisoArquivo: guardado.ok
      ? null
      : `O documento foi indexado e o agente já usa, mas não consegui guardar o PDF para download (${guardado.erro}).`,
    ...acervo,
  });
}

/** Remove um documento do acervo e apaga os trechos dele da base vetorial. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const arquivo = req.nextUrl.searchParams.get("arquivo");
  if (!arquivo) {
    return NextResponse.json({ error: "Diga qual documento remover." }, { status: 400 });
  }

  const fora = await removerDoAcervo(arquivo);
  if (!fora.ok) return NextResponse.json({ error: fora.erro }, { status: 404 });

  // Os trechos saem DEPOIS da lista, e a falha aqui não desfaz a remoção: um documento fora
  // da lista e com trecho sobrando ainda responde na busca, então o erro tem de ser dito em
  // voz alta em vez de engolido. Quem lê a mensagem sabe que precisa tentar de novo.
  const trechos = await apagarTrechos(fora.fonte);
  // O PDF guardado sai junto, e só para o que foi subido pelo painel: os sete vivem no
  // repositório e não é uma remoção de acervo que apaga arquivo de dentro do commit.
  if (fora.tipo === "adicionado") await apagarPdf(arquivo);
  const acervo = await listarAcervo();

  if (!trechos.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `Tirei o documento da lista, mas NÃO consegui apagar os trechos dele da base (${trechos.erro}). Enquanto isso não acontecer, o agente pode continuar recebendo trechos desse material. Tente remover de novo.`,
        ...acervo,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, removido: arquivo, tipo: fora.tipo, ...acervo });
}
