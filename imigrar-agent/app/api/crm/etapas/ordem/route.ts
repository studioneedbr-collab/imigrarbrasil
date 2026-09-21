import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession, forbidden } from "@/lib/auth/guard";
import { normalizarPapel } from "@/lib/auth/papeis";
import { registrarAcesso } from "@/lib/auth/auditoria";

export const dynamic = "force-dynamic";

/**
 * REORDENAR AS ETAPAS DE UM FUNIL — a ordem inteira, de uma vez.
 *
 * Antes a tela trocava duas etapas de lugar com dois PATCH em sequência. Funciona quando
 * os dois dão certo. Quando o primeiro grava e o segundo falha — rede caindo, sessão
 * expirando, aba fechada no meio —, as duas etapas ficam com a MESMA `ordem`, e a partir
 * daí a posição das colunas passa a depender de como o banco desempata. O quadro se
 * reorganiza sozinho na cara de quem estava arrumando, e não há como saber o que
 * aconteceu.
 *
 * Aqui a tela manda a lista inteira na ordem que quer, e o servidor escreve todas. É o
 * mesmo número de gravações, mas uma decisão só — e é o que permite arrastar uma etapa
 * três posições sem virar seis chamadas.
 *
 * O funil vem no corpo e é conferido contra cada etapa: sem isso, uma lista de ids de
 * outro funil reordenaria o quadro errado.
 */
function podeDesenhar(role: unknown): boolean {
  const papel = normalizarPapel(role);
  return papel === "admin" || papel === "advogado";
}

const corpo = z.object({
  funilId: z.string().min(1),
  /** Os ids na ordem desejada. O índice vira a `ordem`. */
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!podeDesenhar(auth.session.role)) return forbidden();

  let input: z.infer<typeof corpo>;
  try {
    input = corpo.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const repo = getRepository();
  try {
    const todas = await repo.listEtapas();
    const doFunil = todas.filter((e) => e.funilId === input.funilId && !e.arquivada);

    // A LISTA PRECISA SER O FUNIL INTEIRO, não um pedaço dele. Reordenar metade das
    // etapas deixaria a outra metade com `ordem` de antes, intercalada com a nova — que
    // é o mesmo empate que este endpoint existe para acabar.
    const esperados = new Set(doFunil.map((e) => e.id));
    const recebidos = new Set(input.ids);
    if (esperados.size !== recebidos.size || input.ids.some((id) => !esperados.has(id))) {
      return NextResponse.json(
        { error: "A ordem enviada não corresponde às etapas deste funil. Recarregue a tela." },
        { status: 409 },
      );
    }

    const etapas = [];
    for (let i = 0; i < input.ids.length; i++) {
      etapas.push(await repo.atualizarEtapa(input.ids[i], { ordem: i }));
    }

    await registrarAcesso(
      auth.session,
      "reordenou_etapas",
      {
        tipo: "crm_funil",
        id: input.funilId,
        detalhe: etapas.map((e) => e.nome).join(" → "),
      },
      req,
    );
    return NextResponse.json({ ok: true, etapas });
  } catch (err) {
    console.error("[crm/etapas/ordem:POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível salvar a nova ordem." }, { status: 400 });
  }
}
