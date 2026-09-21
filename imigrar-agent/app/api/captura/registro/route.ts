import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { conferirTokenDeCaptura } from "@/lib/auth/token-de-captura";
import { sugerirMapeamento } from "@/lib/importacao/campos";
import { lerLinha } from "@/lib/importacao/planilha";
import { aplicarImportacao } from "@/lib/importacao/aplicar";

export const dynamic = "force-dynamic";

/**
 * UM REGISTRO DE OUTRO SISTEMA, NA HORA EM QUE ELE ACONTECE.
 *
 * O WordPress do site guarda leads em tipos de conteúdo próprios ("Orçamentos" e o que
 * mais criarem depois). Eles não estão na REST pública — o que está certo — então não há
 * como buscá-los de fora. Esta rota inverte o sentido: o WordPress EMPURRA cada registro
 * assim que ele é salvo lá.
 *
 * ── QUEM MAPEIA OS CAMPOS É AQUI, NÃO QUEM CHAMA ──────────────────────────────────
 *
 * O corpo traz `campos` CRU: o dicionário inteiro, com os nomes que o outro sistema usa.
 * Não é preguiça — é a única forma que não quebra. Os campos são do ACF, criados à mão
 * por quem montou o site, e podem ganhar um irmão amanhã sem ninguém avisar. Se o PHP
 * escolhesse o que mandar, ele precisaria conhecer a lista de campos do CRM; seriam duas
 * listas, em dois servidores, divergindo em silêncio na primeira vez que uma mudasse. É o
 * defeito que já apareceu quatro vezes neste projeto.
 *
 * Então o outro lado manda tudo e não decide nada, e a interpretação acontece com as
 * MESMAS pistas da importação de planilha (`lib/importacao/campos.ts`), que já estão
 * testadas. Um campo novo no WordPress passa a ser entendido aqui sem tocar no PHP.
 *
 * ── É LITERALMENTE UMA LINHA DE PLANILHA ──────────────────────────────────────────
 *
 * Um registro é uma linha; as chaves de `campos` são o cabeçalho. Por isso esta rota não
 * tem regra de deduplicação própria: ela reusa `aplicarImportacao`, e ganha de graça o que
 * já foi decidido e testado lá —
 *
 *   · o par (fonte, id) identifica o registro mesmo que o telefone mude;
 *   · o telefone, com as variantes do nono dígito, junta este caso com a conversa de
 *     WhatsApp da mesma pessoa;
 *   · atualizar PREENCHE BURACO e não reescreve: o que uma pessoa escreveu na ficha vale
 *     mais do que um campo do site;
 *   · a etapa nunca é movida por quem chega de fora (`NUNCA_REESCREVE`), então editar o
 *     registro no WordPress não puxa de volta para "Novo" um caso que o time já avançou.
 *
 * Salvar o mesmo registro dez vezes no WordPress resulta num card só. É o requisito.
 */

const schema = z.object({
  /**
   * DE ONDE VEIO, de forma estável. `wordpress:orcamento`, por exemplo. Junto com
   * `idExterno` forma a identidade do registro — então mudar esta string depois faz todos
   * os registros daquele tipo parecerem novos. Quem manda precisa mantê-la fixa.
   */
  fonte: z.string().trim().min(1).max(80),
  /** O id no sistema de origem (o ID do post no WordPress). */
  idExterno: z.string().trim().min(1).max(80),
  /** O dicionário cru: nome do campo lá → valor. */
  campos: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

/** O vocabulário de planilha de `lerLinha`, dito para quem lê o log do site. */
function semTelefone(problema: string): string {
  if (/telefone/i.test(problema)) return problema;
  return "o registro não tem telefone — sem ele o caso é um card que ninguém consegue retomar";
}

export async function POST(req: NextRequest) {
  const recusa = conferirTokenDeCaptura(req);
  if (recusa) return recusa;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "json_invalido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "dados_invalidos", detalhes: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { fonte, idExterno, campos } = parsed.data;

  const cabecalho = Object.keys(campos);
  const celulas = cabecalho.map((c) => campos[c]);

  try {
    const linha = lerLinha(celulas, sugerirMapeamento(cabecalho), 1, fonte);

    // O ID VEM DO CORPO, e não de uma coluna adivinhada pelas pistas. `lerLinha` procura
    // uma coluna chamada "id"/"código"/"ref", que numa planilha é o que existe — aqui o
    // id verdadeiro é o do post, e deixá-lo depender de o WordPress ter por acaso um campo
    // com esse nome seria apostar a deduplicação inteira num acaso.
    linha.idExterno = idExterno;
    linha.patch.origemExternaId = idExterno;
    // Veio do site, não de uma planilha que alguém subiu à mão.
    linha.patch.origem = "site";

    if (linha.problema) {
      // 200, não 4xx. Um registro sem telefone é comum e não é erro de quem chamou; se
      // respondêssemos erro, o WordPress registraria falha a cada salvamento de um
      // rascunho vazio e o log viraria ruído que ninguém lê mais.
      //
      // O MOTIVO É TRADUZIDO NA FRONTEIRA. `lerLinha` fala de planilha ("linha vazia",
      // "linha de totais") porque é de lá que ela vem; quem vai ler isto é quem abre o
      // log do WordPress, onde não existe linha nenhuma. Um motivo que a pessoa não
      // entende é o mesmo que motivo nenhum.
      return NextResponse.json({
        ok: true,
        desfecho: "ignorado",
        detalhe: semTelefone(linha.problema),
      });
    }

    const rel = await aplicarImportacao([linha], getRepository(), { aplicar: true });
    const r = rel.linhas[0];
    return NextResponse.json({
      ok: true,
      desfecho: r?.desfecho ?? "ignorado",
      detalhe: r?.detalhe ?? "",
      avisos: r?.avisos ?? [],
      nome: r?.nome ?? null,
    });
  } catch (err) {
    console.error("[captura/registro] falhou:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "falha_interna" }, { status: 500 });
  }
}
