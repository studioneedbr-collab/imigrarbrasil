import { NextRequest, NextResponse } from "next/server";
import { requireSession, forbidden } from "@/lib/auth/guard";
import { normalizarPapel } from "@/lib/auth/papeis";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { getRepository } from "@/lib/data";
import { lerArquivo } from "@/lib/importacao/arquivo";
import { sugerirMapeamento, CAMPOS, CAMPO_OBRIGATORIO } from "@/lib/importacao/campos";
import { lerLinha, type Mapeamento } from "@/lib/importacao/planilha";
import { aplicarImportacao } from "@/lib/importacao/aplicar";

export const dynamic = "force-dynamic";
// Uma planilha de mil linhas com deduplicação faz várias escritas. O default da Vercel
// corta no meio, e importação cortada no meio é o pior estado possível desta tela.
export const maxDuration = 60;

/**
 * IMPORTAR PLANILHA.
 *
 * Dois passos, e o primeiro NUNCA grava:
 *
 *   sem `mapa`  → analisa: devolve o cabeçalho, o palpite de mapeamento e quantas linhas
 *                 há. É o que a tela usa para montar o formulário de "esta coluna é o quê".
 *   com `mapa`  → executa. `aplicar: false` é ensaio e devolve o relatório completo sem
 *                 escrever nada; `aplicar: true` grava.
 *
 * O ARQUIVO SOBE DE NOVO NO SEGUNDO PASSO, de propósito. Guardar a planilha entre as duas
 * chamadas significaria estado de sessão no servidor para uma tela que se usa três vezes
 * por ano — e, pior, uma planilha com a situação migratória de dezenas de pessoas parada
 * em algum lugar esperando alguém terminar de mapear, ou fechar a aba e esquecer.
 *
 * QUEM IMPORTA. A mesma régua de quem exporta: advogado e administrador. Atendente
 * trabalha na fila e no detalhe — trazer uma base inteira para dentro do painel é outra
 * coisa, e fica registrada no log de acesso como qualquer movimento de base.
 */
function podeImportar(role: unknown): boolean {
  const papel = normalizarPapel(role);
  return papel === "admin" || papel === "advogado";
}

/** 8 MB: a planilha do comercial tem 40 KB. Isto é teto contra engano, não contra uso. */
const TAMANHO_MAXIMO = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!podeImportar(auth.session.role)) return forbidden();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }

  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ error: "Escolha um arquivo." }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return NextResponse.json(
      { error: "Arquivo grande demais (o limite é 8 MB)." },
      { status: 400 },
    );
  }

  let planilha;
  try {
    planilha = await lerArquivo(arquivo.name, await arquivo.arrayBuffer());
  } catch (err) {
    console.error("[importacao] leitura:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Não consegui ler este arquivo. Ele é uma planilha .csv ou .xlsx?" },
      { status: 400 },
    );
  }

  if (planilha.cabecalho.length === 0 || planilha.linhas.length === 0) {
    return NextResponse.json(
      { error: "A planilha está vazia, ou não achei o cabeçalho dela." },
      { status: 400 },
    );
  }

  // ── PASSO 1: ANALISAR ──
  const mapaCru = form.get("mapa");
  if (typeof mapaCru !== "string") {
    return NextResponse.json({
      ok: true,
      passo: "analise",
      arquivo: arquivo.name,
      cabecalho: planilha.cabecalho,
      linhaDoCabecalho: planilha.linhaDoCabecalho,
      totalLinhas: planilha.linhas.length,
      mapaSugerido: sugerirMapeamento(planilha.cabecalho),
      campos: CAMPOS,
      // Três linhas de exemplo: é o que permite conferir o mapeamento olhando o DADO, e
      // não só o nome da coluna. "Cidade / Estado" e "País de Residência" se distinguem
      // muito mais rápido vendo "Boa Vista" embaixo de uma delas.
      amostra: planilha.linhas.slice(0, 3).map((l) => l.map((c) => String(c ?? ""))),
    });
  }

  // ── PASSO 2: EXECUTAR ──
  let mapa: Mapeamento;
  try {
    mapa = JSON.parse(mapaCru) as Mapeamento;
  } catch {
    return NextResponse.json({ error: "Mapeamento inválido." }, { status: 400 });
  }
  if (mapa[CAMPO_OBRIGATORIO] === null || mapa[CAMPO_OBRIGATORIO] === undefined) {
    return NextResponse.json(
      { error: "Escolha qual coluna é o WhatsApp. Sem telefone não dá para montar um caso." },
      { status: 400 },
    );
  }

  const aplicar = form.get("aplicar") === "true";
  const moverEtapa = form.get("moverEtapa") === "true";
  const fonte = arquivo.name;

  const linhas = planilha.linhas.map((celulas, i) =>
    lerLinha(celulas, mapa, planilha.linhaDoCabecalho + i + 1, fonte),
  );

  try {
    const relatorio = await aplicarImportacao(linhas, getRepository(), { aplicar, moverEtapa });
    if (aplicar) {
      await registrarAcesso(
        auth.session,
        "importou_planilha",
        {
          tipo: "importacao",
          id: fonte,
          detalhe: `${relatorio.criados} novos, ${relatorio.atualizados} atualizados, ${relatorio.ignorados} ignorados`,
        },
        req,
      );
    }
    return NextResponse.json({ ok: true, passo: aplicar ? "aplicado" : "ensaio", relatorio });
  } catch (err) {
    console.error("[importacao] execução:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "A importação falhou." }, { status: 500 });
  }
}
