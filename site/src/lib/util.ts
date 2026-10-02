const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "17 mar 2026". O site antigo mostrava a hora de agora em todos os cards da home. */
export function dataCurta(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function dataLonga(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
}

export const textoPuro = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

/** Tira o parêntese explicativo dos títulos de serviço, que existe por causa do SEO. */
export const tituloCurto = (t: string) => t.replace(/\s*\([^)]*\)\s*$/, "").trim();

export const slugify = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
