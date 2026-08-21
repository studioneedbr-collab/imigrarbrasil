import type { Lead, LeadStage, Urgency } from "@/lib/domain/types";

export interface ScoredLead extends Lead {
  score: number;
  scoreBreakdown?: {
    engajamento: number;
    responsividade: number;
    velocidade: number;
    interesse: number;
  };
  messageCount?: number;
  lastActivityAt?: string;
  // Nome do perfil do WhatsApp (da conversa), usado quando o lead não tem nome próprio.
  conversationName?: string | null;
}

// Nome de exibição do lead: contato > empresa > nome do WhatsApp > "Lead sem nome".
export function leadName(lead: ScoredLead): string {
  return (
    lead.contactName?.trim() ||
    lead.companyName?.trim() ||
    lead.conversationName?.trim() ||
    "Lead sem nome"
  );
}

export interface StageMeta {
  key: LeadStage;
  label: string;
  dot: string;
  head: string;
  chip: string;
}

export const STAGES: StageMeta[] = [
  { key: "novo", label: "Novo", dot: "bg-ib-slate", head: "text-ib-slate", chip: "bg-ib-slate/10 text-ib-slate" },
  { key: "qualificado", label: "Qualificado", dot: "bg-ib-mar", head: "text-ib-mar", chip: "bg-ib-mar/10 text-ib-mar" },
  { key: "orcado", label: "Orçado", dot: "bg-ib-selo", head: "text-ib-selo", chip: "bg-ib-selo/12 text-[#0B7285]" },
  { key: "transferido", label: "Transferido", dot: "bg-ib-violeta", head: "text-ib-violeta", chip: "bg-ib-violeta/12 text-[#5B44CC]" },
  { key: "ganho", label: "Ganho", dot: "bg-ib-success", head: "text-ib-success", chip: "bg-ib-success/12 text-[#15803D]" },
  { key: "perdido", label: "Perdido", dot: "bg-ib-danger", head: "text-ib-danger", chip: "bg-ib-danger/10 text-ib-danger" },
  { key: "desqualificado", label: "Desqualificado", dot: "bg-slate-400", head: "text-ib-slate", chip: "bg-slate-100 text-ib-slate" },
];

export function stageMeta(stage: LeadStage): StageMeta {
  return STAGES.find((s) => s.key === stage) ?? STAGES[0];
}

export interface ServiceCategory {
  key: string;
  label: string;
  match: string[];
  badge: string;
}

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  { key: "portaria", label: "Portaria", match: ["portaria", "porteiro"], badge: "bg-ib-bruma text-ib-casa" },
  { key: "limpeza", label: "Limpeza", match: ["limpeza", "faxina", "zeladoria"], badge: "bg-emerald-50 text-emerald-700" },
  { key: "manutencao", label: "Manutenção", match: ["manuten"], badge: "bg-amber-50 text-amber-700" },
  { key: "jardinagem", label: "Jardinagem", match: ["jardin", "paisagis"], badge: "bg-lime-50 text-lime-700" },
  { key: "recepcao", label: "Recepção", match: ["recep"], badge: "bg-violet-50 text-violet-700" },
  { key: "piscina", label: "Piscina", match: ["piscina"], badge: "bg-cyan-50 text-cyan-700" },
];

export function serviceBadgeClass(service?: string): string {
  if (!service) return "bg-ib-papel text-ib-slate";
  const lower = service.toLowerCase();
  const cat = SERVICE_CATEGORIES.find((c) => c.match.some((m) => lower.includes(m)));
  return cat?.badge ?? "bg-ib-papel text-ib-slate";
}

export interface UrgencyMeta {
  key: Urgency;
  label: string;
  dot: string;
}

export const URGENCIES: UrgencyMeta[] = [
  { key: "immediate", label: "Imediato", dot: "bg-ib-danger" },
  { key: "short", label: "Curto prazo", dot: "bg-ib-warn" },
  { key: "medium", label: "Médio prazo", dot: "bg-ib-mar" },
  { key: "long", label: "Longo prazo", dot: "bg-ib-slate" },
];

export function urgencyMeta(u?: Urgency | null): UrgencyMeta | undefined {
  return URGENCIES.find((x) => x.key === u);
}

export type ViewMode = "kanban" | "lista";
