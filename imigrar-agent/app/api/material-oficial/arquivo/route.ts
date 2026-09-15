import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guard";
import { lerPdf, nomeSeguro } from "@/lib/agent/acervo-arquivos";
import { listarAcervo } from "@/lib/agent/acervo";

export const dynamic = "force-dynamic";

/**
 * BAIXAR UM PDF DO ACERVO.
 *
 * Leitura, então `requireSession` e não `requireAdmin`: quem atende precisa conseguir abrir a
 * cartilha que sustenta a resposta que está dando. Escrever no acervo é que é de
 * administrador.
 *
 * SÓ O QUE ESTÁ NO ACERVO. A checagem contra a lista existe além do `nomeSeguro`: sem ela,
 * esta rota viraria um leitor de qualquer PDF que estivesse na pasta do repositório, e o
 * acervo "vale" é o do banco — documento removido não deve continuar servindo download.
 *
 * O zip de "baixar todos" NÃO é montado aqui. Ele é montado no navegador, chamando esta rota
 * uma vez por documento: 21 MB de PDF num único corpo de resposta é justamente o tamanho que
 * a plataforma corta, e um zip que chega truncado é pior que download nenhum.
 */
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const pedido = req.nextUrl.searchParams.get("arquivo") ?? "";
  const nome = nomeSeguro(pedido);
  if (!nome) {
    return NextResponse.json({ error: "Nome de arquivo inválido." }, { status: 400 });
  }

  const { documentos } = await listarAcervo();
  const doAcervo = documentos.find((d) => d.arquivo.toLowerCase() === nome.toLowerCase());
  if (!doAcervo) {
    return NextResponse.json({ error: "Este documento não está no acervo." }, { status: 404 });
  }

  const pdf = await lerPdf(nome);
  if (!pdf.ok) return NextResponse.json({ error: pdf.erro }, { status: 404 });

  // `attachment` com o nome do arquivo: o navegador salva em vez de abrir num visualizador,
  // que é o que se espera de um botão escrito "Baixar".
  return new NextResponse(Buffer.from(pdf.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.bytes.byteLength),
      "Content-Disposition": `attachment; filename="${nome}"`,
      // Acervo trocável: cachear isto entregaria a cartilha antiga depois de alguém subir a
      // versão nova, com o mesmo nome de arquivo.
      "Cache-Control": "no-store",
    },
  });
}
