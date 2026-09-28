import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession, forbidden } from "@/lib/auth/guard";
import { normalizarPapel } from "@/lib/auth/papeis";
import { registrarAcesso } from "@/lib/auth/auditoria";

export const dynamic = "force-dynamic";

function podeDesenhar(role: unknown): boolean {
  const papel = normalizarPapel(role);
  return papel === "admin" || papel === "advogado";
}

/**
 * O QUE SE EDITA É O RÓTULO.
 *
 * `chave` não está aqui de propósito, e não é esquecimento: ela é o que está gravado nos
 * casos já fechados. Trocá-la tornaria esses casos órfãos em silêncio — o relatório
 * passaria a mostrar uma categoria a menos e uma coluna de valores sem nome, sem nada
 * indicando o que aconteceu. Renomear "Preço" para "Preço/condições" corrige o histórico
 * inteiro de uma vez; trocar a chave o partiria em dois.
 */
const patch = z.object({
  rotulo: z.string().trim().min(2).max(60).optional(),
  ajuda: z.string().trim().max(160).nullable().optional(),
  ordem: z.number().int().min(0).max(99).optional(),
  arquivado: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!podeDesenhar(auth.session.role)) return forbidden();

  let input: z.infer<typeof patch>;
  try {
    input = patch.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  try {
    const motivo = await getRepository().atualizarMotivo(params.id, input);
    await registrarAcesso(
      auth.session,
      "editou_motivo",
      { tipo: "crm_motivo", id: params.id, detalhe: motivo.rotulo },
      req,
    );
    return NextResponse.json({ ok: true, motivo });
  } catch (err) {
    console.error("[crm/motivos:PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível salvar o motivo." }, { status: 400 });
  }
}

/**
 * APAGAR É DIFERENTE DE ARQUIVAR, e a tela oferece os dois.
 *
 * Arquivar tira do seletor e mantém o nome do que já foi fechado com aquela categoria.
 * Apagar só faz sentido para o motivo criado por engano, que ninguém usou ainda — e o
 * banco recusa apagar os que o próprio sistema escreve (hoje `sumiu`, da varredura de
 * follow-up). A mensagem que sobe é a do banco, escrita para ser lida por gente.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!podeDesenhar(auth.session.role)) return forbidden();

  const repo = getRepository();
  try {
    const alvo = (await repo.listMotivos()).find((m) => m.id === params.id);
    if (!alvo) return NextResponse.json({ error: "Este motivo não existe mais." }, { status: 404 });

    // QUANTOS CASOS JÁ FORAM FECHADOS COM ELE. Apagar uma categoria em uso deixa os casos
    // com uma chave que nenhuma tela sabe nomear — e é o tipo de estrago que só aparece no
    // relatório do mês seguinte. Arquivar resolve os dois lados.
    const emUso = (await repo.listLeads()).filter((l) => l.motivoPerdaCategoria === alvo.chave).length;
    if (emUso > 0) {
      return NextResponse.json(
        {
          error: `${emUso} ${emUso === 1 ? "caso já foi fechado" : "casos já foram fechados"} com este motivo. Arquive-o: ele sai do seletor e continua nomeando o histórico.`,
        },
        { status: 409 },
      );
    }

    await repo.excluirMotivo(params.id);
    await registrarAcesso(
      auth.session,
      "apagou_motivo",
      { tipo: "crm_motivo", id: params.id, detalhe: alvo.rotulo },
      req,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Não foi possível apagar o motivo.";
    console.error("[crm/motivos:DELETE]", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
