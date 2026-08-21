import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { getSession } from "@/lib/auth/guard";
import { computeLeadScore } from "@/lib/agent/lead-score";
import type { Lead, LeadStage } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

// Lista os leads com lead score computado (engajamento, responsividade, velocidade,
// interesse) + contexto para o Kanban/CRM.
export async function GET() {
  const repo = getRepository();
  // Escopo por setor NO SERVIDOR: um usuário restrito a um setor só recebe os leads do
  // próprio setor (admin vê tudo). Antes a restrição existia só na UI — qualquer sessão
  // podia ler todos os leads (e CPFs) chamando /api/leads direto. Isso fecha esse IDOR.
  const session = await getSession();
  let restrictSetor: string | null = null;
  if (session && session.role !== "admin") {
    const user = await repo.getUserByEmail(session.email);
    restrictSetor = user?.setor ?? null;
  }
  const all = await repo.listLeads();
  const leads = restrictSetor
    ? all.filter((l) => (l.setor || "comercial") === restrictSetor)
    : all;
  leads.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const enriched = await Promise.all(
    leads.map(async (lead) => {
      const [messages, conv] = await Promise.all([
        repo.listMessages(lead.conversationId),
        repo.getConversation(lead.conversationId),
      ]);
      const { score, breakdown } = computeLeadScore({ messages, lead });
      const lastActivityAt = messages.length
        ? messages[messages.length - 1].createdAt
        : lead.createdAt;
      return {
        ...lead,
        // Nome do perfil do WhatsApp (via Z-API senderName) fica na conversa — usado
        // como fallback quando o lead ainda não tem contactName próprio.
        conversationName: conv?.contactName ?? null,
        whatsappNumber: conv?.whatsappNumber ?? lead.whatsappNumber,
        score,
        scoreBreakdown: breakdown,
        messageCount: messages.length,
        lastActivityAt,
      };
    }),
  );

  return NextResponse.json({ leads: enriched });
}

const STAGES: [LeadStage, ...LeadStage[]] = [
  "novo",
  "qualificado",
  "orcado",
  "transferido",
  "ganho",
  "perdido",
  "desqualificado",
];

const patchSchema = z.object({
  conversationId: z.string(),
  stage: z.enum(STAGES).optional(),
  status: z.enum(["new", "contacted", "proposal_sent", "negotiating", "won", "lost"]).optional(),
  contactName: z.string().optional(),
  companyName: z.string().optional(),
  email: z.string().optional(),
  servicesInterested: z.array(z.string()).optional(),
  employeesNeeded: z.coerce.number().int().nonnegative().max(100000).optional(),
  region: z.string().max(200).optional(),
  schedule: z.string().max(40).optional(),
  urgency: z.enum(["immediate", "short", "medium", "long"]).optional(),
  estimatedValue: z.coerce.number().nonnegative().max(1_000_000_000).optional(),
  notes: z.string().max(5000).optional(),
  setor: z.enum(["comercial", "operacional", "rh", "departamento_pessoal", "suprimentos", "diretoria"]).optional(),
});

// Move o lead de etapa no Kanban (stage) e/ou atualiza o status legado, além de
// permitir edição manual dos dados do lead (nome, empresa, serviços etc.).
export async function PATCH(req: NextRequest) {
  try {
    const {
      conversationId,
      stage,
      status,
      contactName,
      companyName,
      email,
      servicesInterested,
      employeesNeeded,
      region,
      schedule,
      urgency,
      estimatedValue,
      notes,
      setor,
    } = patchSchema.parse(await req.json());
    const patch: Partial<Lead> = {};
    if (setor) patch.setor = setor;
    if (stage) patch.stage = stage;
    if (status) patch.status = status;
    if (contactName !== undefined) patch.contactName = contactName;
    if (companyName !== undefined) patch.companyName = companyName;
    if (email !== undefined) patch.email = email;
    if (servicesInterested !== undefined) patch.servicesInterested = servicesInterested;
    if (employeesNeeded !== undefined) patch.employeesNeeded = employeesNeeded;
    if (region !== undefined) patch.region = region;
    if (schedule !== undefined) patch.schedule = schedule;
    if (urgency !== undefined) patch.urgency = urgency;
    if (estimatedValue !== undefined) patch.estimatedValue = estimatedValue;
    if (notes !== undefined) patch.notes = notes;
    const lead = await getRepository().upsertLead(conversationId, patch);
    return NextResponse.json({ ok: true, lead });
  } catch (err) {
    console.error("[leads:PATCH]", err);
    return NextResponse.json({ error: "Falha ao atualizar lead" }, { status: 400 });
  }
}

// Exclui um lead pelo id (?id=...). A conversa/mensagens permanecem; some só o card do CRM.
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Informe o id do lead." }, { status: 400 });
  try {
    await getRepository().deleteLead(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[leads:DELETE]", err);
    return NextResponse.json({ error: "Falha ao excluir lead" }, { status: 400 });
  }
}
