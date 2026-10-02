import type { EventoSite } from "./conteudo";

/**
 * O QUE O SITE FEZ NO PERÍODO.
 *
 * Função pura sobre as linhas de site_eventos — a mesma conta nos dois repositórios e
 * testável sem banco. A pergunta que ela responde não é "quantas visitas", é "quais
 * páginas e quais botões trazem conversa": por isso a taxa de conversão e o ranking de
 * cliques por alvo vêm antes de qualquer contagem bruta.
 */

export interface ContagemSite { chave: string; n: number }
export interface ResumoSite {
  visitas: number;
  cliques: number;
  formularios: number;
  /** Cliques de WhatsApp + formulários, por visita. É o número que importa. */
  conversao: number;
  porDia: { dia: string; visitas: number; contatos: number }[];
  paginas: ContagemSite[];
  alvos: ContagemSite[];
  paises: ContagemSite[];
  dispositivos: ContagemSite[];
  origens: ContagemSite[];
  idiomas: ContagemSite[];
}

const contar = (itens: (string | null | undefined)[], limite = 10): ContagemSite[] => {
  const m = new Map<string, number>();
  for (const i of itens) if (i) m.set(i, (m.get(i) ?? 0) + 1);
  return Array.from(m, ([chave, n]) => ({ chave, n })).sort((a, b) => b.n - a.n).slice(0, limite);
};

/** "2026-10-01" no fuso de Brasília — é o dia do escritório, não o de Londres. */
const diaSP = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));

/** Contato é o que vira conversa: clique no WhatsApp ou formulário enviado. */
export const ehContato = (e: EventoSite) => e.tipo === "formulario" || (e.tipo === "clique" && e.alvo === "whatsapp");

export function resumirSite(eventos: EventoSite[], dias: number, hoje = new Date()): ResumoSite {
  const visitas = eventos.filter((e) => e.tipo === "visita");
  const cliques = eventos.filter((e) => e.tipo === "clique");
  const formularios = eventos.filter((e) => e.tipo === "formulario");
  const contatos = eventos.filter(ehContato).length;

  // Todos os dias do período aparecem, inclusive os zerados: um buraco no gráfico é
  // informação ("o site parou de mandar evento") e não pode virar uma linha contínua.
  const porDia = new Map<string, { visitas: number; contatos: number }>();
  for (let i = dias - 1; i >= 0; i--) {
    porDia.set(diaSP(new Date(hoje.getTime() - i * 86_400_000).toISOString()), { visitas: 0, contatos: 0 });
  }
  for (const e of eventos) {
    const d = porDia.get(diaSP(e.criadoEm));
    if (!d) continue;
    if (e.tipo === "visita") d.visitas++;
    if (ehContato(e)) d.contatos++;
  }

  return {
    visitas: visitas.length,
    cliques: cliques.length,
    formularios: formularios.length,
    conversao: visitas.length ? contatos / visitas.length : 0,
    porDia: Array.from(porDia, ([dia, v]) => ({ dia, ...v })),
    paginas: contar(visitas.map((e) => e.pagina)),
    alvos: contar(cliques.map((e) => e.alvo), 12),
    paises: contar(visitas.map((e) => e.pais)),
    dispositivos: contar(visitas.map((e) => e.dispositivo)),
    origens: contar(visitas.map((e) => e.origem ?? "direto")),
    idiomas: contar(visitas.map((e) => e.idioma)),
  };
}

/** Rótulo legível do alvo de um clique ("cta:hero" → "Botão do topo (hero)"). */
export function rotuloDoAlvo(alvo: string): string {
  const [tipo, resto] = alvo.split(":");
  const fixos: Record<string, string> = {
    whatsapp: "WhatsApp",
    telefone: "Telefone",
    email: "E-mail",
    instagram: "Instagram",
    linkedin: "LinkedIn",
    facebook: "Facebook",
    x: "X (Twitter)",
    youtube: "YouTube",
    tiktok: "TikTok",
    ebook: "Comprar e-book",
    idioma: "Trocar idioma",
  };
  if (fixos[alvo]) return fixos[alvo];
  if (tipo === "cta") return `Botão: ${resto}`;
  if (tipo === "servico") return `Serviço: ${resto}`;
  if (tipo === "idioma") return `Idioma: ${resto?.toUpperCase()}`;
  return alvo;
}
