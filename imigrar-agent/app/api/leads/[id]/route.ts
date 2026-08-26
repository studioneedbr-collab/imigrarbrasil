import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";
import type { Lead } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/**
 * O DETALHE DO LEAD: a conversa inteira à esquerda, a ficha à direita.
 *
 * A leitura fica registrada no log de acesso. Aqui não se abre um cadastro comercial —
 * abre-se a situação migratória de uma pessoa, às vezes irregular, às vezes solicitante
 * de refúgio. Quem abriu precisa ser respondível depois.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const repo = getRepository();
  const lead = await repo.getLead(params.id);
  if (!lead) return NextResponse.json({ error: "lead_not_found" }, { status: 404 });

  const [conversation, messages, usuarios] = await Promise.all([
    repo.getConversation(lead.conversationId),
    repo.listMessages(lead.conversationId),
    repo.listUsers().catch(() => []),
  ]);
  const reclassificacoes = (await repo.listReclassificacoes().catch(() => [])).filter(
    (r) => r.leadId === lead.id,
  );

  await registrarAcesso(auth.session, "abriu_lead", { tipo: "lead", id: lead.id }, req);

  return NextResponse.json({
    lead,
    conversation,
    messages,
    reclassificacoes,
    usuarios: usuarios.map((u) => ({ id: u.id, nome: u.name || u.email })),
  });
}

/**
 * A FICHA, CORRIGIDA À MÃO.
 *
 * O que a IA errou, o humano conserta aqui — e a correção fica. Duas coisas NÃO passam
 * por este caminho, de propósito:
 *   · as datas de prazo, que só entram por POST /api/leads/[id]/prazo, com autor;
 *   · a classificação, que muda por POST /api/leads/[id]/classificacao, porque mudar
 *     classificação é reclassificar, e reclassificar registra o par (de → para).
 */
const fichaSchema = z.object({
  contactName: z.string().max(160).nullish(),
  email: z.string().max(254).nullish(),
  idioma: z.string().max(8).nullish(),
  nacionalidade: z.string().max(120).nullish(),
  localizacao: z.enum(["brasil", "exterior"]).nullish(),
  paisExterior: z.string().max(120).nullish(),
  entradaControleMigratorio: z.boolean().nullish(),
  documentosPossui: z.string().max(2000).nullish(),
  documentosFaltantes: z.string().max(2000).nullish(),
  vinculoFamiliarBrasil: z.string().max(2000).nullish(),
  situacaoDocumental: z.string().max(2000).nullish(),
  objetivo: z.string().max(1000).nullish(),
  modalidadeProvavel: z.string().max(200).nullish(),
  resumo: z.string().max(1000).nullish(),
  temPrazoCorrendo: z.boolean().optional(),
  notes: z.string().max(5000).nullish(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let patch: Partial<Lead>;
  try {
    patch = fichaSchema.parse(await req.json()) as Partial<Lead>;
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  try {
    const lead = await getRepository().updateLead(params.id, patch);
    await registrarAcesso(
      auth.session,
      "corrigiu_ficha",
      { tipo: "lead", id: params.id, detalhe: Object.keys(patch).join(",") },
      req,
    );
    return NextResponse.json({ ok: true, lead });
  } catch (err) {
    console.error("[leads/id:PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não foi possível salvar a ficha." }, { status: 400 });
  }
}
