import Link from "next/link";
import { getRepository } from "@/lib/data";
import {
  BRL,
  fmtDateShort,
  Card,
  SectionTitle,
  StatStrip,
  Kpi,
  EmptyState,
  PageHeader,
} from "@/components/dashboard/ui";
import type { LeadStage } from "@/lib/domain/types";
import PrintButton from "./print-button";

export const dynamic = "force-dynamic";

const STAGE_META: { key: LeadStage; label: string; color: string }[] = [
  { key: "novo", label: "Novo", color: "#5B6B7F" },
  { key: "qualificado", label: "Qualificado", color: "#1D6FE0" },
  { key: "orcado", label: "Orçado", color: "#23B5D3" },
  { key: "transferido", label: "Transferido", color: "#7C5CFF" },
  { key: "ganho", label: "Ganho", color: "#16A34A" },
  { key: "perdido", label: "Perdido", color: "#DC2626" },
];

/* ── Barras horizontais (mesmo padrão da Visão Geral) ── */
function BarList({
  rows,
  emptyLabel,
}: {
  rows: { label: string; count: number; color: string }[];
  emptyLabel: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const hasData = rows.some((r) => r.count > 0);
  if (!hasData) {
    return <p className="px-5 py-8 text-center text-sm text-ib-slate">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-3 p-5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ib-ink">{r.label}</span>
            <span className="font-mono text-xs tabular-nums text-ib-slate">{r.count}</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-ib-papel">
            <div
              className="h-full rounded-full"
              style={{ width: `${r.count > 0 ? Math.max(4, (r.count / max) * 100) : 0}%`, background: r.color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function RelatoriosPage() {
  const repo = getRepository();
  const [conversations, leads, proposals, clientes, funcionarios, users] = await Promise.all([
    repo.listConversations(),
    repo.listLeads(),
    repo.listProposals(),
    repo.listClientes(),
    repo.listFuncionarios(),
    repo.listUsers(),
  ]);

  // ── Métricas do agente (mensagens, tempo de resposta, objeções) ──
  const allMessages = await Promise.all(conversations.map((c) => repo.listMessages(c.id)));
  const flatMsgs = allMessages.flat();
  const enviadas = flatMsgs.filter((m) => m.role === "assistant").length;
  const recebidas = flatMsgs.filter((m) => m.role === "user").length;

  let respSum = 0;
  let respN = 0;
  for (const msgs of allMessages) {
    for (let i = 1; i < msgs.length; i++) {
      if (msgs[i].role === "assistant" && msgs[i - 1].role === "user") {
        const dt = new Date(msgs[i].createdAt).getTime() - new Date(msgs[i - 1].createdAt).getTime();
        if (dt >= 0 && dt < 3600_000) {
          respSum += dt;
          respN += 1;
        }
      }
    }
  }
  const avgRespSec = respN ? Math.round(respSum / respN / 1000) : 0;
  const avgRespLabel = avgRespSec === 0 ? "—" : avgRespSec < 60 ? `${avgRespSec}s` : `${Math.round(avgRespSec / 60)}min`;

  const leadsQualificados = leads.filter((l) => ["qualificado", "orcado", "ganho"].includes(l.stage)).length;

  const OBJ_KEYS = [
    { label: "Preço / achou caro", terms: ["caro", "preço", "valor alto", "muito alto"] },
    { label: "Vou pensar / depois", terms: ["pensar", "depois", "mais tarde", "analisar", "retorno"] },
    { label: "Comparando concorrência", terms: ["concorrente", "outra empresa", "cotação", "outra cotação"] },
    { label: "Prazo / urgência", terms: ["urgente", "rápido", "para ontem", "amanhã"] },
    { label: "Dúvida sobre confiança", terms: ["confiança", "seguro", "golpe", "referência"] },
  ];
  const objecoes = OBJ_KEYS.map((o) => ({
    label: o.label,
    count: flatMsgs.filter((m) => m.role === "user" && o.terms.some((t) => m.content.toLowerCase().includes(t))).length,
    color: "#DC2626",
  })).sort((a, b) => b.count - a.count);

  const pipelineValue = proposals.reduce((sum, p) => sum + (p.totalValue ?? 0), 0);

  // Funil por etapa.
  const funnel = STAGE_META.map((s) => ({
    label: s.label,
    color: s.color,
    count: leads.filter((l) => l.stage === s.key).length,
  }));
  const ganhos = leads.filter((l) => l.stage === "ganho").length;
  const conversionRate = leads.length ? Math.round((ganhos / leads.length) * 100) : 0;

  // Serviços mais procurados.
  const serviceCount = new Map<string, number>();
  for (const l of leads) for (const s of l.servicesInterested ?? []) serviceCount.set(s, (serviceCount.get(s) ?? 0) + 1);
  const services = Array.from(serviceCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count, color: "#1D6FE0" }));

  // Propostas: mapa leadId -> nome de empresa/contato para exibição.
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const latestProposals = [...proposals]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6 print:space-y-4">
      <PageHeader
        eyebrow="Operação"
        title="Relatórios"
        description="Panorama consolidado de tudo que acontece na operação comercial."
        actions={
          <div className="print:hidden">
            <PrintButton />
          </div>
        }
      />

      <StatStrip>
        <Kpi label="Conversas" value={String(conversations.length)} />
        <Kpi label="Leads" value={String(leads.length)} />
        <Kpi label="Propostas" value={String(proposals.length)} />
        <Kpi label="Valor em pipeline" value={BRL(pipelineValue)} />
        <Kpi label="Clientes cadastrados" value={String(clientes.length)} />
        <Kpi label="Funcionários cadastrados" value={String(funcionarios.length)} />
      </StatStrip>

      {/* Desempenho do agente */}
      <StatStrip>
        <Kpi label="Mensagens enviadas" value={String(enviadas)} />
        <Kpi label="Mensagens recebidas" value={String(recebidas)} />
        <Kpi label="Leads atendidos" value={String(leads.length)} />
        <Kpi label="Leads qualificados" value={String(leadsQualificados)} />
        <Kpi label="Tempo de resposta médio" value={avgRespLabel} />
      </StatStrip>

      <Card>
        <SectionTitle>Principais objeções (detectadas nas conversas)</SectionTitle>
        <BarList rows={objecoes} emptyLabel="Nenhuma objeção detectada ainda." />
      </Card>

      <Card>
        <SectionTitle
          right={<span className="font-mono text-xs tabular-nums text-ib-slate">{leads.length} leads</span>}
        >
          Relatório de leads
        </SectionTitle>
        <BarList rows={funnel} emptyLabel="Sem leads registrados ainda." />
        {leads.length > 0 ? (
          <p className="border-t border-ib-line px-5 py-3 text-sm text-ib-slate">
            <span className="font-mono font-semibold tabular-nums text-ib-ink">{conversionRate}%</span> dos leads
            viraram ganho.
          </p>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Serviços mais procurados</SectionTitle>
          <BarList rows={services} emptyLabel="Nenhum serviço registrado ainda." />
        </Card>

        <Card>
          <SectionTitle
            right={
              <Link href="/dashboard/proposals" className="text-xs font-semibold text-ib-mar hover:underline">
                Ver todas
              </Link>
            }
          >
            Propostas
          </SectionTitle>
          {proposals.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ib-slate">Nenhuma proposta emitida ainda.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 border-b border-ib-line px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ib-slate">
                    Total emitido
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-ib-ink">
                    {proposals.length}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ib-slate">
                    Valor total
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-ib-ink">
                    {BRL(pipelineValue)}
                  </p>
                </div>
              </div>
              <ul className="divide-y divide-ib-line">
                {latestProposals.map((p) => {
                  const lead = p.leadId ? leadById.get(p.leadId) : undefined;
                  const title =
                    lead?.companyName ?? lead?.contactName ?? p.services[0]?.name ?? "Proposta";
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ib-ink">{title}</p>
                        <p className="font-mono text-xs tabular-nums text-ib-slate">
                          {fmtDateShort(p.createdAt)}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-ib-ink">
                        {BRL(p.totalValue ?? 0)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Base cadastral</SectionTitle>
          <ul className="divide-y divide-ib-line">
            <li className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-ib-ink">Clientes</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold tabular-nums text-ib-ink">
                  {clientes.length}
                </span>
                <Link href="/dashboard/clientes" className="text-xs font-semibold text-ib-mar hover:underline">
                  Ver
                </Link>
              </div>
            </li>
            <li className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-ib-ink">Funcionários</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold tabular-nums text-ib-ink">
                  {funcionarios.length}
                </span>
                <Link
                  href="/dashboard/funcionarios"
                  className="text-xs font-semibold text-ib-mar hover:underline"
                >
                  Ver
                </Link>
              </div>
            </li>
            <li className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-ib-ink">Usuários</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold tabular-nums text-ib-ink">
                  {users.length}
                </span>
                <Link href="/dashboard/users" className="text-xs font-semibold text-ib-mar hover:underline">
                  Ver
                </Link>
              </div>
            </li>
          </ul>
        </Card>

        <Card>
          <SectionTitle
            right={<span className="font-mono text-xs tabular-nums text-ib-slate">{users.length}</span>}
          >
            Acessos ao painel
          </SectionTitle>
          {users.length === 0 ? (
            <EmptyState
              title="Nenhum usuário cadastrado"
              text="Cadastre usuários em Configuração para que apareçam aqui."
            />
          ) : (
            <ul className="divide-y divide-ib-line">
              {users.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ib-ink">{u.name ?? u.email}</p>
                    <p className="truncate text-xs text-ib-slate">{u.email}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ib-slate">
                      {u.role === "admin" ? "Admin" : "Usuário"}
                    </p>
                    <p className="font-mono text-[11px] tabular-nums text-ib-slate">
                      desde {fmtDateShort(u.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-ib-line px-5 py-2.5 text-xs text-ib-slate">
            Usuários com acesso ao painel. Não registramos data do último login.
          </p>
        </Card>
      </div>
    </div>
  );
}
