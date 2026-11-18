/**
 * QUEM PREENCHEU O FORMULÁRIO DO SITE — o que a tela e a planilha têm em comum.
 *
 * Não é uma lista à parte: são os leads do CRM com origem "site" (a captura grava assim,
 * app/api/captura/site). A página e o formulário de onde a pessoa veio estão na nota que a
 * captura escreve — "Origem: …" e "Página: …" — e é de lá que saem. Mora aqui, e não na
 * página, para a planilha exportada dizer exatamente o mesmo que a tela.
 */

export const FORMULARIOS_POR_PAGINA = 50;

export function daNota(nota: string | null | undefined, campo: "Origem" | "Página"): string | null {
  return nota?.match(new RegExp(`^${campo}: (.+)$`, "m"))?.[1]?.trim() ?? null;
}

const ROTULO_FORMULARIO: Record<string, string> = {
  modal: "Botão “Fale com a gente”",
  "home-faq": "Home (dúvidas)",
  "fale-conosco": "Página Fale Conosco",
  blog: "Artigo do blog",
};

export const nomeDoFormulario = (o: string | null): string =>
  !o ? "—" : ROTULO_FORMULARIO[o] ?? (o.startsWith("servico:") ? `Serviço: ${o.slice(8)}` : o);

export const quandoEmBrasilia = (iso: string): string =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/**
 * Uma célula de CSV. Além das aspas, neutraliza FÓRMULA: nome e e-mail aqui são digitados
 * por qualquer visitante do site, e uma célula que começa com = + - @ é executada pelo
 * Excel de quem abre a planilha. O apóstrofo na frente faz o Excel ler como texto.
 */
export function celulaCsv(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
