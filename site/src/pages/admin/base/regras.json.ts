// As regras do blog (temas e serviço relacionado) em texto, para o PHP do /admin aplicar as
// MESMAS expressões de src/lib/blog.ts — uma fonte só.
import { TEMAS, REGRAS } from "../../../lib/blog";
import { SITE, whatsappLink } from "../../../config";
import { ICONE } from "../../../lib/icones";
export const GET = () =>
  new Response(JSON.stringify({
    temas: TEMAS.map((t) => ({ slug: t.slug, nome: t.nome, casa: t.casa.source, intro: t.intro })),
    regras: REGRAS.map(([re, slug]) => [re.source, slug]),
    site: { url: SITE.url, descricao: SITE.descricao, whatsappLink: whatsappLink() },
    icones: { seta: ICONE.seta, whatsapp: ICONE.whatsapp, documento: ICONE.documento, busca: ICONE.busca },
    build: new Date().toISOString(),
  }));
