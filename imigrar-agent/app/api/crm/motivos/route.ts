import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession, forbidden } from "@/lib/auth/guard";
import { normalizarPapel } from "@/lib/auth/papeis";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { TIPOS_DE_MOTIVO, type TipoDeMotivo } from "@/lib/domain/types";
import { chaveDoRotulo } from "@/lib/crm/motivos";

export const dynamic = "force-dynamic";

/**
 * AS CATEGORIAS DE DESFECHO — "por que perdemos" e "por que desqualificamos".
 *
 * Eram seis, escritas em quatro camadas do código (união de tipos, array, enum do zod e
 * check do banco) e inalcançáveis por quem usa o sistema. Viraram dado na migration 034.
 *
 * LER É PARA TODO MUNDO; EDITAR NÃO. Quem atende precisa da lista para fechar um caso
 * como perdido — é o seletor do próprio atendimento. Mas mudar as categorias muda o
 * vocabulário de TODO relatório do escritório, e é decisão de quem responde pelo funil.
 */
function podeDesenhar(role: unknown): boolean {
  const papel = normalizarPapel(role);
  return papel === "admin" || papel === "advogado";
}


const criar = z.object({
  tipo: z.enum(TIPOS_DE_MOTIVO as [TipoDeMotivo, ...TipoDeMotivo[]]),
  rotulo: z.string().trim().min(2, "Dê um nome ao motivo.").max(60),
  ajuda: z.string().trim().max(160).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const tipo = req.nextUrl.searchParams.get("tipo");
  const filtro = TIPOS_DE_MOTIVO.includes(tipo as TipoDeMotivo) ? (tipo as TipoDeMotivo) : undefined;
  return NextResponse.json({ motivos: await getRepository().listMotivos(filtro) });
}

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

  const chave = chaveDoRotulo(input.rotulo);
  if (!chave) {
    return NextResponse.json(
      { error: "Esse nome não gera um identificador. Use letras ou números." },
      { status: 400 },
    );
  }

  const repo = getRepository();
  try {
    // UM MOTIVO ARQUIVADO COM A MESMA CHAVE É O MESMO MOTIVO, e não um conflito: quem
    // arquivou "Preço" e o recria meses depois quer o histórico de volta junto, não uma
    // segunda categoria que divide o mesmo assunto em duas linhas do relatório.
    const existente = (await repo.listMotivos(input.tipo)).find((m) => m.chave === chave);
    if (existente) {
      if (!existente.arquivado) {
        return NextResponse.json({ error: "Já existe um motivo com esse nome." }, { status: 409 });
      }
      const motivo = await repo.atualizarMotivo(existente.id, {
        arquivado: false,
        rotulo: input.rotulo,
        ajuda: input.ajuda ?? null,
      });
      return NextResponse.json({ ok: true, motivo, reativado: true });
    }

    const motivo = await repo.criarMotivo({
      tipo: input.tipo,
      chave,
      rotulo: input.rotulo,
      ajuda: input.ajuda ?? null,
    });
    await registrarAcesso(
      auth.session,
      "criou_motivo",
      { tipo: "crm_motivo", id: motivo.id, detalhe: `${motivo.rotulo} (${motivo.tipo})` },
      req,
    );
    return NextResponse.json({ ok: true, motivo });
  } catch (err) {
    console.error("[crm/motivos:POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível criar o motivo." }, { status: 400 });
  }
}
