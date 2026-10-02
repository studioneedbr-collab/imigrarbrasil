// Tudo o que o blog calcula a partir dos posts: temas, serviço relacionado, perguntas.
import posts from "../data/posts.json";
import servicos from "../data/servicos.json";
import { textoPuro } from "./util";

export type Post = (typeof posts)[number];
export type Servico = (typeof servicos)[number];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ── temas ───────────────────────────────────────────────────────────────────────
//
// O WordPress tinha 594 tags, quase todas com 1 post: páginas rasas que competiam entre si
// no Google. Aqui são poucos temas, cada um com texto próprio, os artigos e os serviços
// daquele assunto — o "cluster" que o Google entende como autoridade no tema.
//
// `casa` é testado contra título + palavras-chave + descrição, sem acento e em minúsculas.
// `tag` reconhece os slugs das tags antigas, para o 301 do nginx (deploy/).

export const TEMAS = [
  {
    slug: "naturalizacao", nome: "Naturalização e nacionalidade",
    casa: /naturaliza|nacionalidade|cidadania|brasileiro nato|passaporte brasileiro/,
    tag: "naturaliza|nacionalidade|cidadania|nato",
    intro: "Prazos, requisitos e caminhos para se tornar brasileiro: naturalização ordinária, extraordinária e especial, reconhecimento de nacionalidade e o que fazer quando o processo atrasa.",
  },
  {
    slug: "vistos", nome: "Vistos para o Brasil",
    casa: /\bvisto|vitem|vivis|working holiday|nomade digital/,
    tag: "visto|vitem|vivis|nomade|working-holiday",
    intro: "Qual visto pedir para cada objetivo — estudo, trabalho remoto, missão religiosa, aposentadoria, férias-trabalho — e o que o consulado costuma exigir.",
  },
  {
    slug: "residencia", nome: "Autorização de residência",
    casa: /autorizacao de residencia|residencia (no brasil|temporaria|permanente|por)|residente|retorno ao brasil|\barb\b/,
    tag: "residencia|residente|arb|retorno",
    intro: "Como conseguir, renovar e transformar a autorização de residência no Brasil, com base na Lei de Migração e nas portarias em vigor.",
  },
  {
    slug: "documentos", nome: "CRNM, CPF e documentos",
    casa: /crnm|\brnm\b|\bcpf\b|apostila|traducao juramentada|documento|conta bancaria|carteira de motorista|\bpid\b|migranteweb/,
    tag: "crnm|rnm|cpf|apostil|traducao|documento|conta|migranteweb|cnh|pid",
    intro: "Os documentos do dia a dia do imigrante: CRNM, CPF, conta bancária, carteira de motorista, apostilamento e tradução juramentada.",
  },
  {
    slug: "familia", nome: "Família e reunião familiar",
    casa: /familia|familiar|filho|casad|casamento|divorcio|uniao estavel|conjuge/,
    tag: "familia|familiar|filho|casamento|divorcio|uniao|conjuge",
    intro: "Trazer cônjuge, filhos e pais para o Brasil, casamento e divórcio entre estrangeiros, e a nacionalidade dos filhos nascidos aqui.",
  },
  {
    slug: "trabalho", nome: "Trabalho e carreira no Brasil",
    casa: /trabalho|emprego|empregaticio|experiencia profissional|executivo|engenheir|registro profissional|aposentadoria|marítimo|maritimo/,
    tag: "trabalho|emprego|executivo|engenheir|profissional|aposentadoria|maritimo",
    intro: "Residência por trabalho, registro profissional, executivos estrangeiros, marítimos e aposentadoria com tempo trabalhado no exterior.",
  },
  {
    slug: "estudo", nome: "Estudo e diplomas",
    casa: /estud|universidade|diploma|revalida|intercambio|equivalencia/,
    tag: "estud|universidade|diploma|revalida|intercambio|equivalencia",
    intro: "Visto de estudante, revalidação de diploma estrangeiro e como a residência para estudo pode virar permanente.",
  },
  {
    slug: "investimentos", nome: "Investimentos e empresas",
    casa: /invest|empresa|negocio|banco central|\bied\b|sce|capital estrangeiro|imovel|imobiliari|golden visa|remessa|cambio|residente fiscal|imposto/,
    tag: "invest|empresa|negocio|banco-central|ied|sce|capital|imovel|imobiliari|golden|remessa|cambio|fiscal|imposto|cnpj",
    intro: "Abrir empresa, investir e comprar imóvel no Brasil sendo estrangeiro: registro no Banco Central, residência por investimento e tributação.",
  },
  {
    slug: "regularizacao", nome: "Regularização e defesa migratória",
    casa: /regulariza|expulsao|impedido|overstay|multa|recurso|atraso|atrasad|demor|processo criminal|refugio|asilo|humanitari|acolhida|indeniza/,
    tag: "regulariza|expuls|impedid|overstay|multa|recurso|atras|refugi|asilo|humanitari|acolhida",
    intro: "Quando algo dá errado: processo parado, indeferimento, multa, expulsão, refúgio e acolhida humanitária — e os direitos de quem está nessa situação.",
  },
  {
    slug: "mercosul-cplp", nome: "Mercosul e países de língua portuguesa",
    casa: /mercosul|cplp|lingua portuguesa|portugal|acordo/,
    tag: "mercosul|cplp|portugal|lusofon",
    intro: "As regras próprias para nacionais do Mercosul e da Comunidade dos Países de Língua Portuguesa, que costumam ter o caminho mais curto.",
  },
] as const;
export type Tema = (typeof TEMAS)[number];

const textoDoPost = (p: Post) => norm(`${p.title} ${p.keywords.join(" ")} ${p.description ?? ""}`);

/** Temas do post; o que aparece no TÍTULO vem primeiro (é o tema principal, o da trilha). */
export const temasDoPost = (p: Post): Tema[] => {
  const titulo = norm(p.title);
  return TEMAS.filter((t) => t.casa.test(textoDoPost(p))).sort((a, b) => Number(!a.casa.test(titulo)) - Number(!b.casa.test(titulo)));
};
export const postsDoTema = (t: Tema): Post[] => posts.filter((p) => t.casa.test(textoDoPost(p)));
/** Só temas com artigos suficientes viram página — tema com 1 post é a tag rasa de novo. */
export const TEMAS_ATIVOS = TEMAS.filter((t) => postsDoTema(t).length >= 3);
export const urlDoTema = (t: Tema) => `/blog-imigracao-brasil/tema/${t.slug}/`;

// ── serviço relacionado ─────────────────────────────────────────────────────────
//
// Cada artigo aponta para o serviço que resolve o assunto dele. É o link interno que leva
// a autoridade do blog (que ranqueia) para a página de serviço (que converte).

// Tabela escrita à mão: com 30 serviços, uma regra explícita acerta mais do que contar
// palavras em comum — "residência" e "familiar" aparecem em metade das descrições, e por
// isso "passaporte vencido" caía em Reunião Familiar. Ordem = prioridade no empate.
export const REGRAS: [RegExp, string][] = [
  [/naturaliza|cidadania brasileira/, "naturalizacao-brasileira-ordinaria-extraordinaria-especial-e-provisoria-conversao-em-definitiva"],
  [/passaporte brasileiro|brasileiro nato|registro consular|nascido no exterior|dupla nacionalidade|e-consular|nascido no brasil/, "reconhecimento-de-nacionalidade-brasileira-originaria-brasileiro-nato-nascido-no-exterior-registro-consular-transcricao-e-opcao"],
  [/\bcpf\b|conta bancaria|abrir conta/, "obtencao-de-cpf-e-abertura-de-contas-bancarias"],
  [/crnm|\brnm\b|carteira de registro nacional/, "emissao-substituicao-e-renovacao-da-crnm-rnm-documento-do-imigrante"],
  [/casad|casamento|uniao estavel|conjuge|divorcio/, "residencia-casamento-uniao-estavel-brasileiro-reuniao-familiar"],
  [/reuniao familiar|reagrupamento|familiar|dependente|comprovar renda|comprovacao de renda/, "reuniao-familiar-brasil-vitem-xi-autorizacao-residencia"],
  [/\bcplp\b|lingua portuguesa|portugal/, "residencia-no-brasil-para-nacionais-de-paises-de-lingua-portuguesa"],
  [/mercosul/, "autorizacao-de-residencia-pelo-mercosul-cplp-e-acordos-bilaterais-visto-e-regularizacao"],
  [/nomade digital/, "visto-nomade-digital-brasil-vitem-xiv"],
  [/aposentad|pensionista/, "residencia-para-aposentados-e-pensionistas-no-brasil-visto-temporario-e-regularizacao-migratoria"],
  [/estud|universidade|intercambio/, "vitem-iv-visto-de-estudante-no-brasil"],
  [/missionari|religios|voluntari/, "visto-temporario-atividade-religiosa-vitem-vii-servico-voluntario-vitem-viii"],
  [/maritim|tripulante/, "visto-maritimo-tripulante-embarcado-regularizacao-brasil"],
  [/imovel rural|compra de imovel|aquisicao de imovel|imobiliari|golden visa|imovel/, "residencia-investidor-imobiliario-rn-36-2018-golden-visa"],
  [/investimento estrangeiro direto|\bied\b|banco central|\bsce\b|capital estrangeiro|remessa|cambio/, "registro-de-investimento-estrangeiro-direto-no-banco-central-sce-ied-rde-ied-e-remessa-de-lucros"],
  [/startup|inovacao/, "visto-residencia-empreendedor-startup-inovacao-brasil"],
  [/abrir empresa|empreend|negocios no brasil|plano de negocios/, "visto-residencia-para-empreendedor-plano-de-negocios"],
  [/executivo|diretor|gestor|mobilidade|empresas estrangeiras|trabalho|emprego|experiencia profissional|engenheir|registro profissional/, "mobilidade-global-para-o-brasil-empresas-e-organizacoes"],
  [/apostila|legalizacao|traducao juramentada|diploma|revalida/, "apostilamento-de-haia-e-legalizacao-consular-de-documentos-estrangeiros-validade-no-brasil"],
  [/overstay|excesso de prazo|multa migratoria/, "regularizacao-por-excesso-de-prazo-overstay-e-multa-migratoria"],
  [/recurso|indeferi|negad|atras|demor|parado|cancelamento|expuls|impedid|processo criminal/, "recurso-administrativo-em-imigracao-indeferimentos-exigencias-e-cancelamentos"],
  [/humanitari|acolhida|refugi|asilo|regularizar|regularizacao|transformacao de visto|retorno ao brasil|passaporte vencido|\barb\b/, "transformacao-de-visto-em-autorizacao-de-residencia-regularizacao-no-brasil"],
  [/turismo|visita|dirigir|carteira estrangeira|indeniza/, "visto-de-visita-vivis-brasil"],
  [/relocation|mudanca/, "relocation-familiar-assessoria-completa-para-mudanca-e-regularizacao-migratoria-de-toda-a-familia"],
  [/saude|tratamento medico/, "vitem-ii-tratamento-de-saude-brasil"],
  [/pesquisa|academic|professor/, "vitem-i-pesquisa-ensino-extensao-academica-brasil"],
  [/atleta|clube|futebol/, "regularizacao-migratoria-para-atletas-profissionais-e-clubes-no-brasil-visto-e-residencia"],
];
const porSlug = new Map(servicos.map((s) => [s.slug, s]));

/** O título pesa 3, as palavras-chave 1. Empate fica com a regra que vem antes. */
export function servicosRelacionados(p: Post, quantos = 2): Servico[] {
  const titulo = norm(p.title);
  const chaves = norm(p.keywords.join(" | "));
  return REGRAS
    .map(([re, slug], ordem) => ({ slug, ordem, n: (re.test(titulo) ? 3 : 0) + (re.test(chaves) ? 1 : 0) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.ordem - b.ordem)
    .map((x) => porSlug.get(x.slug)!)
    .filter((s, i, a) => s && a.indexOf(s) === i)
    .slice(0, quantos);
}

// ── perguntas do artigo (FAQPage) ───────────────────────────────────────────────
//
// Quase todo artigo é escrito em perguntas ("A naturalização tem prazo?"). Cada <h2> que
// termina em "?" vira uma pergunta, e os parágrafos até o próximo título, a resposta.
// Alimenta os resultados de busca com IA e o "As pessoas também perguntam".

export function perguntasDoPost(html: string) {
  const out: { pergunta: string; resposta: string }[] = [];
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const pergunta = textoPuro(m[1]);
    if (!pergunta.endsWith("?")) continue;
    const resposta = textoPuro(m[2]);
    if (resposta.length < 40) continue;
    out.push({ pergunta, resposta: resposta.length > 600 ? resposta.slice(0, resposta.lastIndexOf(" ", 590)) + "…" : resposta });
  }
  return out;
}

// ── datas ───────────────────────────────────────────────────────────────────────
//
// O WordPress estava em UTC e escrevia "julho 21, 2026 11:15 pm" (ordem americana, fuso
// de Londres). Aqui é horário de Brasília e formato brasileiro.

const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
const fmtHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" });

/** "21 de julho de 2026, 20h15" */
export function dataHora(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${fmtData.format(d)}, ${fmtHora.format(d).replace(":", "h")}`;
}
