import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { generateReportPdf, type ReportData } from "@/lib/pdf/report";
import type { LeadStage } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

const STAGES: { key: LeadStage; label: string; color: string }[] = [
  { key: "novo", label: "Novo", color: "#5B6B7F" },
  { key: "qualificado", label: "Qualificado", color: "#1D6FE0" },
  { key: "orcado", label: "Orçado", color: "#23B5D3" },
  { key: "transferido", label: "Transferido", color: "#7C5CFF" },
  { key: "ganho", label: "Ganho", color: "#16A34A" },
  { key: "perdido", label: "Perdido", color: "#DC2626" },
];

export async function GET() {
  const repo = getRepository();
  const [conversations, leads, proposals, clientes, funcionarios] = await Promise.all([
    repo.listConversations(),
    repo.listLeads(),
    repo.listProposals(),
    repo.listClientes(),
    repo.listFuncionarios(),
  ]);

  const pipeline = proposals.reduce((sum, p) => sum + (p.totalValue ?? 0), 0);
  const funnel = STAGES.map((st) => ({
    label: st.label,
    color: st.color,
    count: leads.filter((l) => l.stage === st.key).length,
  }));
  const ganhos = leads.filter((l) => l.stage === "ganho").length;
  const conversionRate = leads.length ? Math.round((ganhos / leads.length) * 100) : 0;

  const serviceCount = new Map<string, number>();
  for (const l of leads) for (const svc of l.servicesInterested ?? []) serviceCount.set(svc, (serviceCount.get(svc) ?? 0) + 1);
  const services = Array.from(serviceCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => ({ label, count }));

  const latestProposals = [...proposals]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)
    .map((p) => ({
      empresa: (p.services?.[0]?.name ? `${p.services[0].name}` : "Proposta"),
      total: p.totalValue ?? 0,
      date: new Date(p.createdAt).toLocaleDateString("pt-BR"),
    }));

  const data: ReportData = {
    dateStr: new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
    totals: {
      conversas: conversations.length,
      leads: leads.length,
      propostas: proposals.length,
      pipeline,
      clientes: clientes.length,
      funcionarios: funcionarios.length,
    },
    conversionRate,
    funnel,
    services,
    proposals: latestProposals,
  };

  const buffer = await generateReportPdf(data);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="relatorio-imigrar-brasil.pdf"`,
    },
  });
}
