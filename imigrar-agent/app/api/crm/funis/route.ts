import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession, forbidden } from "@/lib/auth/guard";
import { normalizarPapel } from "@/lib/auth/papeis";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { NOME_MAX } from "@/lib/crm/funil";
import type { AtendimentoStatus } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/**
 * OS FUNIS DO CRM.
 *
 * LER é de todo mundo do painel: sem os funis não há quadro, e o quadro é a tela de
 * trabalho de quem atende.
 *
 * MEXER não é. Um funil não é preferência pessoal — é o desenho do quadro que a equipe
 * inteira usa, e renomear uma coluna no meio da tarde muda o que todos os outros estão
 * lendo. Fica com advogado e administrador, que é a mesma régua de quem pode exportar.
 */
function podeDesenhar(role: unknown): boolean {
  const papel = normalizarPapel(role);
  return papel === "admin" || papel === "advogado";
}

const criar = z.object({
  nome: z.string().trim().min(2, "Dê um nome ao funil.").max(NOME_MAX),
  descricao: z.string().trim().max(200).optional().nullable(),
  padrao: z.boolean().optional(),
});

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const repo = getRepository();
  const [funis, etapas] = await Promise.all([
    repo.listFunis().catch(() => []),
    repo.listEtapas().catch(() => []),
  ]);
  return NextResponse.json({ funis, etapas });
}

/**
 * O DESENHO COM QUE TODA PIPELINE NOVA NASCE.
 *
 * Mora no servidor, e não na tela, porque é regra de domínio: as duas colunas de desfecho
 * (`fechado` e `perdido`) são o que faz o caso SAIR da fila, e um quadro que nasce sem
 * elas é um quadro de onde nada nunca sai. Tudo aqui pode ser renomeado, reordenado e
 * apagado em seguida — o que não pode é não existir no primeiro segundo.
 */
const ETAPAS_INICIAIS: { nome: string; status: AtendimentoStatus; ajuda: string }[] = [
  { nome: "Novo", status: "novo", ajuda: "Chegou e ninguém pegou." },
  { nome: "Em atendimento", status: "em_atendimento", ajuda: "Alguém do time está com a bola." },
  { nome: "Proposta enviada", status: "proposta_enviada", ajuda: "O orçamento está com a pessoa, esperando resposta." },
  { nome: "Reunião agendada", status: "agendado", ajuda: "Reunião marcada com a pessoa." },
  { nome: "Fechado", status: "fechado", ajuda: "Virou cliente ou o assunto se resolveu." },
  { nome: "Perdido", status: "perdido", ajuda: "Não virou atendimento — com o motivo registrado." },
];

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!podeDesenhar(auth.session.role)) return forbidden();

  let input: z.infer<typeof criar>;
  try {
    input = criar.parse(await req.json());
  } catch (err) {
    const issue = err instanceof z.ZodError ? err.issues[0]?.message : null;
    return NextResponse.json({ error: issue ?? "Dados inválidos." }, { status: 400 });
  }

  try {
    const repo = getRepository();
    const funil = await repo.criarFunil(input);

    // AS ETAPAS NASCEM JUNTO, AQUI.
    //
    // Antes a tela criava o funil e depois disparava SEIS requisições, uma por etapa, do
    // navegador — e engolia falha em silêncio (`if (c?.etapa)`). O resultado de qualquer
    // tropeço era uma pipeline pela metade, ou vazia, que é como isto foi relatado: "novo
    // funil não funciona". Fechar a aba no meio bastava.
    //
    // Uma pipeline sem etapa não é uma pipeline incompleta: é um quadro que não mostra
    // caso nenhum. Ou nasce inteira, ou o erro aparece.
    const etapas = [];
    for (let i = 0; i < ETAPAS_INICIAIS.length; i++) {
      const base = ETAPAS_INICIAIS[i];
      etapas.push(await repo.criarEtapa({ ...base, funilId: funil.id, ordem: i }));
    }

    await registrarAcesso(
      auth.session,
      "criou_funil",
      { tipo: "crm_funil", id: funil.id, detalhe: funil.nome },
      req,
    );
    return NextResponse.json({ ok: true, funil, etapas });
  } catch (err) {
    console.error("[crm/funis:POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível criar o funil." }, { status: 400 });
  }
}
