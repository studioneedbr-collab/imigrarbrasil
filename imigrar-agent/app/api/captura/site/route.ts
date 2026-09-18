import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { capturarDadosDoLead } from "@/lib/agent/lead-capture";
import { normalizarTelefone } from "@/lib/whatsapp/telefone";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * A CAPTURA DE LEAD DO SITE.
 *
 * O formulário e o chat do site caem aqui, e o caso entra na PRIMEIRA etapa do funil —
 * a mesma coluna "Novo" de quem escreveu no WhatsApp. Antes não havia porta nenhuma:
 * `/api/leads/[id]` só atualiza quem já existe, e quem preenchia o formulário do site ia
 * parar numa caixa de e-mail que ninguém trata como fila.
 *
 * ── O QUE ESTA ROTA NÃO FAZ, E POR QUÊ ────────────────────────────────────────────
 *
 * NÃO RESPONDE NADA PELO WHATSAPP. Quem preencheu um formulário não escreveu para o
 * nosso número — ela deixou um telefone. Mandar mensagem para esse número é o sistema
 * falando primeiro com quem nunca falou com ele, que é a assinatura de disparo em massa
 * que derruba o número do escritório (ver lib/whatsapp/janela.ts). Quem decide falar é
 * uma pessoa, pelo painel.
 *
 * NÃO GRAVA A MENSAGEM COMO FALA DA PESSOA. Parece o certo e é o contrário: a varredura
 * de follow-up pergunta `jaRespondeuAlguma` olhando se existe mensagem com `role: "user"`
 * na conversa (lib/followup/varredura.ts), e é essa resposta que libera o disparo
 * automático. Uma linha de formulário registrada como fala do WhatsApp faria o cron
 * entender que aquele número já conversou conosco — e mandar follow-up para quem nunca
 * respondeu é exatamente o que a trava existe para impedir. O texto do formulário vai
 * para a ficha do lead, que é onde quem for atender vai lê-lo.
 *
 * ── DEDUPLICAÇÃO ──────────────────────────────────────────────────────────────────
 *
 * Com telefone, a conversa é resolvida por `getOrCreateConversation`, que já junta as
 * grafias do mesmo número (lib/whatsapp/telefone.ts). Então quem preenche o formulário
 * hoje e escreve no WhatsApp amanhã é UMA pessoa na fila, com a ficha inteira — e não
 * dois cards com metade da história em cada.
 *
 * Sem telefone (formulário só com e-mail), a chave é `site:<e-mail>`. Ela nunca vai
 * deduplicar com o WhatsApp, e isso está correto: unir duas pessoas num caso só é pior
 * do que separar uma pessoa em dois.
 */

/** O prefixo de quem chegou pelo site sem deixar telefone. Não é telefone e não disca. */
const PREFIXO_SITE = "site:";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Os endereços do site que podem POSTar do navegador.
 *
 * Só precisa disto quem for chamar a rota de dentro da página. O caminho RECOMENDADO é o
 * servidor do site chamar aqui — no navegador o token vai no código-fonte da página, à
 * vista de qualquer um, e aí ele deixa de ser segredo e vira só um obstáculo.
 */
function origensPermitidas(): string[] {
  return (process.env.SITE_CAPTURE_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function cors(origin: string | null): Record<string, string> {
  const permitidas = origensPermitidas();
  if (!origin || !permitidas.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type, x-imigrar-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

const schema = z
  .object({
    nome: z.string().trim().min(1, "Nome é obrigatório.").max(120),
    // Telefone OU e-mail: sem um dos dois não há como retornar, e um lead sem retorno
    // possível é uma linha na fila que ninguém consegue trabalhar.
    telefone: z.string().trim().max(30).optional(),
    email: z.string().trim().email("E-mail inválido.").max(160).optional().or(z.literal("")),
    mensagem: z.string().trim().max(4000).optional(),
    /** De onde no site veio: "formulario", "chat", "landing-vistos"… Vai para a ficha. */
    origem: z.string().trim().max(60).optional(),
    idioma: z.string().trim().max(8).optional(),
    /**
     * ARMADILHA DE ROBÔ. Um campo escondido no formulário, que gente não vê e não
     * preenche. Vindo preenchido, é robô — e a resposta é 200 em silêncio, porque dizer
     * "recusado" ensina o robô a tentar de outro jeito.
     */
    website: z.string().max(200).optional(),
  })
  .refine((d) => Boolean(d.telefone?.trim() || d.email?.trim()), {
    message: "Informe ao menos telefone ou e-mail.",
    path: ["telefone"],
  });

export async function POST(req: NextRequest) {
  const headers = cors(req.headers.get("origin"));

  // AUTENTICAÇÃO, FAIL-CLOSED — a mesma postura do webhook do WhatsApp. Sem segredo
  // configurado a rota RECUSA em vez de ficar aberta: uma porta que cria lead sem prova
  // nenhuma é a fila do escritório à mercê de quem souber a URL.
  const segredo = env.siteCaptureToken;
  if (!segredo) {
    console.error(
      "[captura/site] RECUSADO: SITE_CAPTURE_TOKEN não está configurado. Enquanto isso " +
        "não for resolvido, nenhum lead do site é aceito.",
    );
    return NextResponse.json(
      { ok: false, error: "captura_sem_autenticacao_configurada" },
      { status: 503, headers },
    );
  }
  const enviado =
    req.headers.get("x-imigrar-token") ?? req.nextUrl.searchParams.get("token") ?? "";
  if (!enviado || !safeEqual(enviado, segredo)) {
    return NextResponse.json({ ok: false, error: "nao_autorizado" }, { status: 401, headers });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "json_invalido" }, { status: 400, headers });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "dados_invalidos", detalhes: parsed.error.flatten().fieldErrors },
      { status: 400, headers },
    );
  }
  const dados = parsed.data;

  // Robô: 200 e nada acontece. Ver o comentário do campo no schema.
  if (dados.website?.trim()) return NextResponse.json({ ok: true }, { headers });

  const repo = getRepository();
  const telefone = normalizarTelefone(dados.telefone);
  const email = dados.email?.trim() || undefined;
  const chave = telefone || `${PREFIXO_SITE}${email}`;

  try {
    const conv = await repo.getOrCreateConversation(chave, dados.nome);
    const jaExiste = await repo.getLeadByConversation(conv.id);

    // A MESMA LEITURA DETERMINÍSTICA DO WHATSAPP. O que a pessoa escreveu no formulário
    // passa pela triagem de sempre (lib/agent/triagem.ts): nacionalidade, onde ela está,
    // o que procura, sinal de prazo. A ficha do site chega ao time no mesmo formato da
    // ficha do WhatsApp, e não como um texto solto que alguém ainda vai ter que ler.
    const daTriagem = dados.mensagem
      ? capturarDadosDoLead(dados.mensagem, jaExiste) ?? {}
      : {};

    // O nome e o e-mail do formulário mandam: foram digitados pela pessoa, num campo com
    // rótulo. Valem mais do que qualquer coisa deduzida do texto livre.
    const origem = dados.origem?.trim() || "formulário do site";
    const nota = [
      `Origem: ${origem}`,
      dados.mensagem ? `\nO que ela escreveu:\n${dados.mensagem}` : "",
    ].join("");

    const lead = await repo.upsertLead(conv.id, {
      ...daTriagem,
      contactName: dados.nome,
      // DE QUE PORTA ESTE CASO VEIO. Só na criação: um contato que já era atendimento do
      // WhatsApp e preencheu o formulário depois continua tendo chegado pelo WhatsApp —
      // reescrever a origem aqui apagaria de onde ele veio de verdade.
      ...(jaExiste ? {} : { origem: "site" as const }),
      ...(email ? { email } : {}),
      ...(jaExiste?.notes ? {} : { notes: nota }),
      // A PRIMEIRA ETAPA DO FUNIL, e só para quem está chegando agora. Quem já é um caso
      // em andamento não volta para "Novo" porque preencheu um formulário — isso apagaria
      // o trabalho de quem já estava com ele.
      ...(jaExiste
        ? {}
        : { stage: "novo" as const, status: "new" as const, atendimentoStatus: "novo" as const }),
      setor: jaExiste?.setor ?? ("comercial" as const),
      ...(dados.idioma && !jaExiste?.idioma ? { idioma: dados.idioma } : {}),
    });

    return NextResponse.json({ ok: true, lead_id: lead.id, novo: !jaExiste }, { headers });
  } catch (err) {
    console.error("[captura/site] falhou:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "falha_interna" }, { status: 500, headers });
  }
}
