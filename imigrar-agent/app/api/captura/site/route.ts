import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { capturarDadosDoLead } from "@/lib/agent/lead-capture";
import { comDdiProvavel } from "@/lib/whatsapp/telefone";
import { IDIOMAS_DO_ESCOPO } from "@/lib/domain/idiomas";
import { conferirTokenDeCaptura } from "@/lib/auth/token-de-captura";

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
    /**
     * EM QUE IDIOMA A PESSOA ESTAVA LENDO O SITE.
     *
     * Quem decide se o código serve é ESTA rota, e não quem chama. O site traduz com o
     * GTranslate, que oferece alemão e italiano — idiomas que esta operação não atende
     * (`IDIOMAS_DO_ESCOPO`). Filtrar do lado do WordPress significaria manter a lista de
     * idiomas escrita também lá, num arquivo PHP noutro servidor, para sair de sincronia
     * com esta em silêncio na primeira vez que a operação ganhasse um idioma novo. É o
     * defeito que já apareceu quatro vezes neste projeto; a lista fica num lugar só.
     *
     * Código fora do escopo é DESCARTADO, não recusado: um alemão no seletor do site não
     * pode custar o lead inteiro. E o idioma do widget é palpite fraco — o que a pessoa
     * escrever no WhatsApp vale mais, e a detecção por texto continua mandando.
     */
    idioma: z
      .string()
      .trim()
      .max(8)
      .optional()
      .transform((v) => {
        const c = v?.toLowerCase().split(/[-_]/)[0] ?? "";
        return (IDIOMAS_DO_ESCOPO as readonly string[]).includes(c) ? c : undefined;
      }),
    /**
     * EM QUE PÁGINA A PESSOA ESTAVA e QUEM INDICOU (`?ref=` na URL). O formulário do site
     * já carrega os dois — `page_url` e `afiliado_ref` — e sem estes campos eles morriam
     * na porta: quem indicou deixaria de ser sabido justamente no caso em que a indicação
     * é o motivo do contato.
     *
     * ELES NÃO PASSAM PELA TRIAGEM, e é de propósito. `mensagem` é texto que a PESSOA
     * escreveu e por isso é lido em busca de nacionalidade, prazo e onde ela está; uma URL
     * ou um código de afiliado não é fala de ninguém, e jogá-los na mesma leitura faria a
     * triagem deduzir coisas de um endereço. Vão para a ficha, e só.
     */
    pagina: z.string().trim().max(300).optional(),
    ref: z.string().trim().max(80).optional(),
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

  // Autenticação fail-closed, compartilhada com /api/captura/registro.
  const recusa = conferirTokenDeCaptura(req, headers);
  if (recusa) return recusa;

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
  // COM O DDI. Sem isto o lead do site e a conversa de WhatsApp da mesma pessoa viram
  // dois cards — no caminho que existe exatamente para juntar as duas pontas. Ver
  // `comDdiProvavel`.
  const telefone = comDdiProvavel(dados.telefone);
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
      dados.pagina ? `\nPágina: ${dados.pagina}` : "",
      dados.ref ? `\nIndicação (ref): ${dados.ref}` : "",
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
