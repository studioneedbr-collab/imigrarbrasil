import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/guard";
import { buildSystemPrompt, type KnowledgeBase } from "@/lib/agent/knowledge";
import {
  getKnowledgeBase,
  getPromptCru,
  getTrainingConfig,
  trainingToOverrides,
} from "@/lib/agent/system-prompt";
import {
  BEHAVIOR_RULES,
  DEFAULT_TRAINING,
  PERSONA_MAX,
  normalizeGuardrails,
  normalizeIdentity,
  normalizeObjections,
  normalizeReasoning,
  normalizeTechnical,
  normalizeTransferRules,
} from "@/lib/agent/training";
import { MATERIAIS, REGRAS_INVIOLAVEIS, blocoMaterialOficial } from "@/lib/agent/material-oficial";
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
  const [kb, training, briefing, faq, promptCru] = await Promise.all([
    getKnowledgeBase(),
    getTrainingConfig(),
    repo.getConfig<Record<string, string>>("briefing"),
    repo.getConfig<FaqItem[]>("faq"),
    getPromptCru(),
  ]);
  return NextResponse.json({
    persona: kb.persona,
    sections: kb.sections,
    ...training,
    briefing: briefing ?? {},
    faq: faq ?? [],
    behaviorRules: BEHAVIOR_RULES.map((r) => ({ id: r.id, label: r.label })),
    // O PREVIEW MOSTRA O PROMPT DE VERDADE. Sem o bloco do material oficial ele mostrava
    // menos do que a Ana recebe — e a tela que existe para ensinar o agente estava
    // escondendo justamente a parte que ninguém pode editar.
    preview: buildSystemPrompt(kb, trainingToOverrides(training)) + blocoMaterialOficial(),
    materialOficial: { regras: REGRAS_INVIOLAVEIS, documentos: MATERIAIS },
    // O override legado, quando existe. A prévia acima continua sendo a desta tela — é ela
    // que mostra o efeito do que se edita aqui. O que faltava era dizer que, com esta
    // chave no banco, o agente não está usando essa prévia. Ver getPromptCru().
    promptCru,
  });
}

const identitySchema = z.object({
  agentName: z.string().trim().min(1).max(60),
  companyName: z.string().trim().min(1).max(120),
  tone: z.enum(["profissional_calorosa", "formal", "direta"]),
  messageLength: z.enum(["curtas", "medias", "detalhadas"]),
});

const bodySchema = z.object({
  persona: z
    .string()
    .trim()
    .min(10, "está curta demais — escreva pelo menos 10 caracteres")
    .max(PERSONA_MAX, `passou de ${PERSONA_MAX.toLocaleString("pt-BR")} caracteres`),
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

/**
 * A MENSAGEM DO VALIDADOR, EM PORTUGUÊS.
 *
 * O zod escreve em inglês e escreve para programador: "Invalid input", "Too big: expected
 * string to have <=8000 characters". Numa tela que a equipe usa em português, isso chegou
 * ao cliente como um enigma — ele abriu chamado perguntando se era o tamanho do texto, sem
 * ter como saber. O campo já vinha no erro; o que faltava era dizer O QUE ele tem de errado.
 *
 * Onde o schema define uma mensagem própria (a persona define), ela vence esta tradução.
 */
function mensagemEmPortugues(issue: z.ZodError["issues"][number]): string {
  // Mensagem escrita à mão no schema — o zod só usa a dele quando não há uma nossa, e as
  // dele são todas em inglês.
  if (issue.message && !/^(Invalid|Too big|Too small|Required|Expected)/.test(issue.message)) {
    return issue.message;
  }
  switch (issue.code) {
    case "too_big": {
      const unidade = issue.origin === "array" ? "itens" : "caracteres";
      return `passou do limite de ${Number(issue.maximum).toLocaleString("pt-BR")} ${unidade}`;
    }
    case "too_small": {
      const unidade = issue.origin === "array" ? "itens" : "caracteres";
      return Number(issue.minimum) <= 1
        ? "está vazio e é obrigatório"
        : `precisa de pelo menos ${Number(issue.minimum).toLocaleString("pt-BR")} ${unidade}`;
    }
    case "invalid_type":
      return "não foi enviado, ou veio num formato que não é o esperado";
    case "invalid_value":
      return "está com um valor que a tela não oferece";
    default:
      return "está com um valor inválido";
  }
}

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

    // CADA BLOCO TEM A SUA CHAVE, e a gravação é conferida uma a uma.
    //
    // Com `Promise.all` a primeira falha abortava a resposta e a mensagem dizia "nada foi
    // alterado" — mentira: as outras escritas já tinham ido ao banco. Um treinamento
    // metade novo e metade velho é o pior estado possível aqui, porque ninguém desconfia
    // dele: a tela mostra o rascunho, o agente usa outra coisa.
    const escritas: [string, Promise<unknown>][] = [
      ["knowledge_base", repo.setConfig("knowledge_base", kb)],
      ["reasoning", repo.setConfig("reasoning", reasoning)],
      ["objections", repo.setConfig("objections", objections)],
      ["transfer_rules", repo.setConfig("transfer_rules", transferRules)],
      ["guardrails", repo.setConfig("guardrails", guardrails)],
      ["technical_knowledge", repo.setConfig("technical_knowledge", technical)],
      ...(b.briefing ? ([["briefing", repo.setConfig("briefing", b.briefing)]] as [string, Promise<unknown>][]) : []),
      ...(b.faq ? ([["faq", repo.setConfig("faq", b.faq)]] as [string, Promise<unknown>][]) : []),
    ];
    const resultados = await Promise.allSettled(escritas.map(([, p]) => p));
    const falhou = escritas
      .map(([chave], i) => (resultados[i].status === "rejected" ? chave : null))
      .filter((c): c is string => !!c);
    if (falhou.length) {
      console.error("[training:PUT] blocos que não gravaram:", falhou.join(", "));
      return NextResponse.json(
        {
          error:
            falhou.length === escritas.length
              ? "Não consegui gravar nada. Nada foi alterado."
              : `Gravei parte do treinamento. NÃO gravou: ${falhou.join(", ")}. Salve de novo para completar.`,
          blocos: falhou,
        },
        { status: 500 },
      );
    }

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
      // O mesmo prompt que o GET devolve — com o bloco do material oficial. Sem ele,
      // salvar fazia as regras invioláveis SUMIREM do preview que o GET acabara de
      // mostrar, e a tela passava a descrever um agente que não existe.
      preview: buildSystemPrompt(kb, trainingToOverrides(training)) + blocoMaterialOficial(),
      // Vai junto para o aviso não sumir depois de salvar: quem acabou de gravar com o
      // override ligado precisa continuar vendo que o agente não está usando isto.
      promptCru: await getPromptCru(),
    });
  } catch (err) {
    console.error("[training:PUT]", err instanceof Error ? err.message : err);
    // O ERRO PRECISA DIZER O CAMPO.
    //
    // A mensagem era "Falha ao salvar o treinamento. Confira os campos obrigatórios." —
    // numa tela com sete abas, dezenas de textos e listas inteiras de objeções, isso
    // manda a pessoa procurar agulha em palheiro. Resultado prático: ninguém nunca
    // salvou nada (o banco de produção tinha uma única chave em `agent_config`), e o
    // agente rodou meses inteiro no padrão de código enquanto a tela dizia que dava para
    // treiná-lo.
    if (err instanceof z.ZodError) {
      const issue = err.issues[0];
      const onde = issue?.path?.length ? issue.path.join(" › ") : "algum campo";
      const porque = issue ? mensagemEmPortugues(issue) : "está com um valor inválido";
      return NextResponse.json(
        { error: `Não salvei: ${onde} ${porque}.`, campo: issue?.path },
        { status: 400 },
      );
    }
    // Não-Zod aqui é erro nosso, não do que a pessoa digitou: 500, e sem prometer que
    // nada mudou — a falha pode ter vindo depois de alguma escrita.
    return NextResponse.json(
      { error: "Falha ao salvar o treinamento. Confira a tela e salve de novo." },
      { status: 500 },
    );
  }
}

/** Padrões de fábrica — usados pelo botão "Restaurar padrões" de cada aba. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  // DESCARTAR O OVERRIDE LEGADO.
  //
  // Grava string vazia em vez de apagar a linha: o repositório expõe setConfig e não um
  // delete, e vazio já não passa pelo piso do getPromptCru(). O texto antigo some, que é o
  // que se pediu — por isso o botão da tela mostra o prompt inteiro antes de perguntar.
  if (req.nextUrl.searchParams.get("descartar") === "prompt_cru") {
    await getRepository().setConfig("system_prompt", "");
    return NextResponse.json({ ok: true, promptCru: null });
  }

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
