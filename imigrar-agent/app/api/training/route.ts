import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/guard";
import { buildSystemPrompt, type KnowledgeBase } from "@/lib/agent/knowledge";
import {
  getKnowledgeBase,
  getTrainingConfig,
  trainingToOverrides,
} from "@/lib/agent/system-prompt";
import {
  BEHAVIOR_RULES,
  DEFAULT_TRAINING,
  normalizeGuardrails,
  normalizeIdentity,
  normalizeObjections,
  normalizeReasoning,
  normalizeTechnical,
  normalizeTransferRules,
} from "@/lib/agent/training";
import type { FaqItem } from "@/app/api/faq/route";

export const dynamic = "force-dynamic";

/**
 * Endpoint único de /dashboard/treinar: lê e grava tudo que a Shayene sabe.
 *
 * A gravação continua indo para as MESMAS chaves de agent_config que cada bloco já usava
 * (knowledge_base, objections, transfer_rules, guardrails, technical_knowledge, briefing,
 * faq) — um endpoint só existe porque a tela tem um botão "Salvar alterações" só, não
 * porque os dados foram fundidos num blob.
 */
export async function GET() {
  const repo = getRepository();
  const [kb, training, briefing, faq] = await Promise.all([
    getKnowledgeBase(),
    getTrainingConfig(),
    repo.getConfig<Record<string, string>>("briefing"),
    repo.getConfig<FaqItem[]>("faq"),
  ]);
  return NextResponse.json({
    persona: kb.persona,
    sections: kb.sections,
    ...training,
    briefing: briefing ?? {},
    faq: faq ?? [],
    behaviorRules: BEHAVIOR_RULES.map((r) => ({ id: r.id, label: r.label })),
    preview: buildSystemPrompt(kb, trainingToOverrides(training)),
  });
}

const identitySchema = z.object({
  agentName: z.string().trim().min(1).max(60),
  companyName: z.string().trim().min(1).max(120),
  tone: z.enum(["profissional_calorosa", "formal", "direta"]),
  messageLength: z.enum(["curtas", "medias", "detalhadas"]),
});

const bodySchema = z.object({
  persona: z.string().trim().min(10).max(8000),
  identity: identitySchema,
  reasoning: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60),
        title: z.string().trim().min(1).max(200),
        body: z.string().max(30000),
      }),
    )
    .min(1)
    .max(40),
  sections: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60),
        title: z.string().trim().min(1).max(160),
        body: z.string().max(30000),
      }),
    )
    .min(1)
    .max(60),
  objections: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60),
        objecao: z.string().trim().min(1).max(500),
        querDizer: z.string().trim().max(500),
        resposta: z.string().trim().min(1).max(3000),
        keywords: z.array(z.string().trim().min(1).max(80)).max(40),
        ativo: z.boolean(),
      }),
    )
    .max(100),
  transferRules: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60),
        categoria: z.string().trim().min(1).max(60),
        keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(40),
        resposta: z.string().trim().min(1).max(3000),
        ativo: z.boolean(),
      }),
    )
    .max(60),
  guardrails: z.object({
    termos: z.array(z.string().trim().min(1).max(120)).max(80),
    regras: z.record(z.string(), z.boolean()),
  }),
  technical: z.object({
    termos: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(60),
          termo: z.string().trim().min(1).max(120),
          definicao: z.string().trim().max(2000),
        }),
      )
      .max(120),
    escalas: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(60),
          nome: z.string().trim().min(1).max(120),
          descricao: z.string().trim().max(2000),
          quandoUsar: z.string().trim().max(2000),
        }),
      )
      .max(40),
  }),
  briefing: z.record(z.string(), z.string().max(4000)).optional(),
  faq: z
    .array(
      z.object({
        pergunta: z.string().trim().min(1).max(500),
        resposta: z.string().trim().min(1).max(2000),
      }),
    )
    .max(200)
    .optional(),
});

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const b = bodySchema.parse(await req.json());
    const repo = getRepository();

    // A identidade mora dentro de knowledge_base junto com a persona: as duas descrevem
    // quem a Shayene é, e gravá-las juntas evita um estado onde o nome já mudou mas a
    // persona ainda fala do nome antigo.
    const kb: KnowledgeBase & { identity: unknown } = {
      persona: b.persona,
      sections: b.sections,
      identity: normalizeIdentity(b.identity),
    };

    const reasoning = normalizeReasoning(b.reasoning);
    const objections = normalizeObjections(b.objections);
    const transferRules = normalizeTransferRules(b.transferRules);
    const guardrails = normalizeGuardrails(b.guardrails);
    const technical = normalizeTechnical(b.technical);

    await Promise.all([
      repo.setConfig("knowledge_base", kb),
      repo.setConfig("reasoning", reasoning),
      repo.setConfig("objections", objections),
      repo.setConfig("transfer_rules", transferRules),
      repo.setConfig("guardrails", guardrails),
      repo.setConfig("technical_knowledge", technical),
      ...(b.briefing ? [repo.setConfig("briefing", b.briefing)] : []),
      ...(b.faq ? [repo.setConfig("faq", b.faq)] : []),
    ]);

    const training = {
      reasoning,
      identity: normalizeIdentity(b.identity),
      objections,
      transferRules,
      guardrails,
      technical,
    };
    return NextResponse.json({
      ok: true,
      preview: buildSystemPrompt(kb, trainingToOverrides(training)),
    });
  } catch (err) {
    console.error("[training:PUT]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Falha ao salvar o treinamento. Confira os campos obrigatórios." },
      { status: 400 },
    );
  }
}

/** Padrões de fábrica — usados pelo botão "Restaurar padrões" de cada aba. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const bloco = req.nextUrl.searchParams.get("restore");
  switch (bloco) {
    case "reasoning":
      return NextResponse.json({ ok: true, reasoning: DEFAULT_TRAINING.reasoning });
    case "objections":
      return NextResponse.json({ ok: true, objections: DEFAULT_TRAINING.objections });
    case "transferRules":
      return NextResponse.json({ ok: true, transferRules: DEFAULT_TRAINING.transferRules });
    case "guardrails":
      return NextResponse.json({ ok: true, guardrails: DEFAULT_TRAINING.guardrails });
    case "technical":
      return NextResponse.json({ ok: true, technical: DEFAULT_TRAINING.technical });
    default:
      return NextResponse.json({ error: "Bloco desconhecido." }, { status: 400 });
  }
}
