import { z } from "zod";

/**
 * O CONTEÚDO DO SITE imigrarbrasil.com, EDITADO PELO PAINEL.
 *
 * O site (pasta site/ do repositório) é HTML estático gerado a partir de JSON. Este
 * arquivo é a forma desse JSON: o painel valida com estes schemas ao salvar, e
 * /api/site/exportar entrega exatamente isto para o build. Mudou um campo aqui, o site
 * precisa ler o campo novo — e é só aqui que ele se define.
 *
 * As listas abaixo têm par no check do banco (migration 035) e são comparadas com ele
 * em tests/constraints-e-dominio.test.ts.
 */

export const TIPOS_CONTEUDO_SITE = ["post", "servico", "config"] as const;
export type TipoConteudoSite = (typeof TIPOS_CONTEUDO_SITE)[number];

export const TIPOS_EVENTO_SITE = ["visita", "clique", "formulario"] as const;
export type TipoEventoSite = (typeof TIPOS_EVENTO_SITE)[number];

export const DISPOSITIVOS_SITE = ["celular", "computador", "tablet"] as const;
export type DispositivoSite = (typeof DISPOSITIVOS_SITE)[number];

/** A configuração é um registro só. */
export const SLUG_CONFIG = "geral";

/** Slug de URL: é o endereço da página no site, e mudar depois quebra o que o Google indexou. */
export const slugValido = z
  .string()
  .trim()
  .min(3, "O endereço precisa de ao menos 3 caracteres.")
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use só letras minúsculas sem acento, números e hífen.");

const texto = (max: number) => z.string().trim().max(max);
const opcional = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => v || null);
const imagem = z
  .string()
  .trim()
  .max(500)
  .refine((v) => !v || v.startsWith("/") || /^https:\/\//.test(v), "A imagem precisa ser um endereço https ou um caminho do site.")
  .nullable()
  .optional()
  .transform((v) => v || null);

export const postSchema = z.object({
  slug: slugValido,
  title: texto(200).min(5, "Dê um título ao artigo."),
  seoTitle: texto(200).optional().default(""),
  description: texto(320).min(50, "A descrição aparece no Google: escreva ao menos 50 caracteres."),
  image: imagem,
  imageAlt: opcional(200),
  author: texto(80).default("Walter Gama"),
  keywords: z.array(texto(80)).max(40).default([]),
  html: z.string().min(200, "O artigo está curto demais para ser publicado.").max(200_000),
  published: z.string().datetime({ offset: true }),
  modified: z.string().datetime({ offset: true }).nullable().optional(),
});
export type PostSite = z.infer<typeof postSchema>;

export const servicoSchema = z.object({
  slug: slugValido,
  title: texto(200).min(5, "Dê um nome ao serviço."),
  seoTitle: texto(200).optional().default(""),
  description: texto(320).min(50, "A descrição aparece no Google: escreva ao menos 50 caracteres."),
  image: imagem,
  categoria: texto(120).min(3, "Escolha a categoria."),
  html: z.string().max(100_000).default(""),
  beneficios: z.array(z.object({ titulo: texto(120), texto: texto(300) })).max(6).default([]),
  paraQuem: z.string().max(20_000).nullable().optional().transform((v) => v || null),
  fechamento: z.string().max(20_000).nullable().optional().transform((v) => v || null),
  published: z.string().nullable().optional(),
  modified: z.string().nullable().optional(),
});
export type ServicoSite = z.infer<typeof servicoSchema>;

const url = z.string().trim().max(300).refine((v) => !v || /^https:\/\//.test(v), "Use um endereço completo, começando com https://").default("");

export const configSchema = z.object({
  telefone: texto(40).min(8),
  whatsapp: z.string().trim().regex(/^\d{10,15}$/, "Só os dígitos, com DDI: 5511919854664."),
  email: z.string().trim().email(),
  endereco: z.object({
    rua: texto(120), bairro: texto(80), cidade: texto(80), uf: texto(2), cep: texto(12),
  }),
  social: z.object({
    instagram: url, linkedin: url, facebook: url, x: url, youtube: url, tiktok: url,
  }),
  /** Os números da home ("352 mil vidas impactadas"). */
  numeros: z.array(z.object({ valor: texto(20).min(1), rotulo: texto(60).min(2) })).max(6),
  /** Os textos das chamadas que se repetem pelo site. */
  ctas: z.object({
    heroPrincipal: texto(40).min(2),
    heroSecundario: texto(40).min(2),
    chamadaTitulo: texto(90).min(5),
    chamadaTexto: texto(240).min(10),
    botaoWhatsapp: texto(40).min(2),
    mensagemWhatsapp: texto(300).min(5),
  }),
  ebookCheckout: url,
});
export type ConfigSite = z.infer<typeof configSchema>;

export const SCHEMA_POR_TIPO = { post: postSchema, servico: servicoSchema, config: configSchema } as const;

/**
 * HTML que o painel aceita no conteúdo.
 *
 * Quem edita é a equipe, mas o HTML vai para um site público: um <script> colado por
 * engano — ou de um texto copiado de outro lugar — rodaria para todo visitante. Tira
 * script, iframe que não seja de vídeo, atributos de evento e links javascript:. Não é um
 * sanitizador completo; é a trava contra o acidente, e a edição é restrita a admin e
 * advogado.
 */
export function limparHtmlDoSite(html: string): string {
  return html
    .replace(/<\s*(script|style|object|embed|form|input|button|textarea|select)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|object|embed|form|input|button|link|meta|base)\b[^>]*\/?>/gi, "")
    .replace(/<\s*iframe\b(?![^>]*src\s*=\s*["']https:\/\/(?:www\.)?(?:youtube(?:-nocookie)?\.com|player\.vimeo\.com)\/)[\s\S]*?(?:<\s*\/\s*iframe\s*>|\/>)/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src)\s*=\s*(["'])\s*(?:javascript|vbscript|data):[^"']*\2/gi, "")
    .replace(/\s+style\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .trim();
}

/** Minutos de leitura, como o site mostra (200 palavras por minuto). */
export function minutosDeLeitura(html: string): number {
  const palavras = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(palavras / 200));
}

/** Rótulos para a tela. */
export const TIPO_EVENTO_LABEL: Record<TipoEventoSite, string> = {
  visita: "Visita",
  clique: "Clique",
  formulario: "Formulário enviado",
};
export const DISPOSITIVO_LABEL: Record<DispositivoSite, string> = {
  celular: "Celular",
  computador: "Computador",
  tablet: "Tablet",
};

/** Uma linha de site_conteudo. `dados` já passou pelo schema do tipo quando foi salvo. */
export interface RegistroSite {
  tipo: TipoConteudoSite;
  slug: string;
  dados: unknown;
  publicado: boolean;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

/** Uma linha de site_eventos. Anônima: ver migration 035. */
export interface EventoSite {
  tipo: TipoEventoSite;
  alvo: string | null;
  pagina: string;
  idioma: string | null;
  pais: string | null;
  dispositivo: DispositivoSite | null;
  origem: string | null;
  criadoEm: string;
}
