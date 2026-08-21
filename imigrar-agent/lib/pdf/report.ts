import React from "react";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const el = React.createElement;

const NAVY = "#0E2A47";
const AZURE = "#23B5D3";
const INK = "#1A2432";
const SLATE = "#5B6B7F";
const LINE = "#E4EBF3";
const MIST = "#F4F7FB";

export interface ReportData {
  dateStr: string;
  totals: { conversas: number; leads: number; propostas: number; pipeline: number; clientes: number; funcionarios: number };
  conversionRate: number;
  funnel: { label: string; count: number; color: string }[];
  services: { label: string; count: number }[];
  proposals: { empresa: string; total: number; date: string }[];
}

const s = StyleSheet.create({
  page: { paddingBottom: 44, fontSize: 10, fontFamily: "Helvetica", color: INK },
  band: { backgroundColor: NAVY, paddingHorizontal: 40, paddingVertical: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brand: { fontSize: 18, color: "#FFFFFF", fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  brandSub: { fontSize: 7, color: AZURE, marginTop: 3, letterSpacing: 2 },
  tag: { fontSize: 8, color: "#FFFFFF", opacity: 0.7, textAlign: "right" },
  tagStrong: { fontSize: 11, color: "#FFFFFF", fontFamily: "Helvetica-Bold", textAlign: "right", marginTop: 2 },
  accent: { height: 3, backgroundColor: AZURE },
  body: { paddingHorizontal: 40, paddingTop: 18 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpi: { width: 150, borderRadius: 6, border: `1 solid ${LINE}`, backgroundColor: MIST, padding: 10 },
  kpiLabel: { fontSize: 7.5, color: SLATE, letterSpacing: 1 },
  kpiValue: { fontSize: 15, color: NAVY, fontFamily: "Helvetica-Bold", marginTop: 3 },
  sectionTitle: { marginTop: 22, marginBottom: 8, fontSize: 9, color: NAVY, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  barRow: { marginTop: 6 },
  barTop: { flexDirection: "row", justifyContent: "space-between" },
  barLabel: { fontSize: 9, color: INK },
  barCount: { fontSize: 9, color: SLATE, fontFamily: "Helvetica-Bold" },
  barTrack: { marginTop: 3, height: 7, borderRadius: 4, backgroundColor: MIST },
  propRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottom: `1 solid ${LINE}` },
  propName: { flex: 3, fontSize: 9 },
  propVal: { flex: 1, fontSize: 9, textAlign: "right", fontFamily: "Helvetica-Bold", color: NAVY },
  propDate: { flex: 1, fontSize: 8, textAlign: "right", color: SLATE },
  footer: { position: "absolute", bottom: 22, left: 40, right: 40, borderTop: `1 solid ${LINE}`, paddingTop: 8, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 7, color: SLATE },
});

function Bars({ rows }: { rows: { label: string; count: number; color: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return el(View, null,
    ...rows.map((r, i) =>
      el(View, { style: s.barRow, key: String(i) },
        el(View, { style: s.barTop },
          el(Text, { style: s.barLabel }, r.label),
          el(Text, { style: s.barCount }, String(r.count)),
        ),
        el(View, { style: s.barTrack },
          el(View, { style: { height: 7, borderRadius: 4, backgroundColor: r.color, width: `${r.count > 0 ? Math.max(4, (r.count / max) * 100) : 0}%` } }),
        ),
      ),
    ),
  );
}

function ReportDocument({ d }: { d: ReportData }) {
  const kpis: [string, string][] = [
    ["CONVERSAS", String(d.totals.conversas)],
    ["LEADS", String(d.totals.leads)],
    ["PROPOSTAS", String(d.totals.propostas)],
    ["PIPELINE", brl(d.totals.pipeline)],
    ["CLIENTES", String(d.totals.clientes)],
    ["FUNCIONÁRIOS", String(d.totals.funcionarios)],
  ];
  return el(Document, null,
    el(Page, { size: "A4", style: s.page },
      el(View, { style: s.band },
        el(View, null,
          el(Text, { style: s.brand }, "SHINE RIO"),
          el(Text, { style: s.brandSub }, "RELATÓRIO OPERACIONAL"),
        ),
        el(View, null,
          el(Text, { style: s.tag }, "GERADO EM"),
          el(Text, { style: s.tagStrong }, d.dateStr),
        ),
      ),
      el(View, { style: s.accent }),

      el(View, { style: s.body },
        el(View, { style: s.kpiRow },
          ...kpis.map(([label, value], i) =>
            el(View, { style: s.kpi, key: String(i) },
              el(Text, { style: s.kpiLabel }, label),
              el(Text, { style: s.kpiValue }, value),
            ),
          ),
        ),

        el(Text, { style: s.sectionTitle }, `FUNIL DE LEADS · conversão ${d.conversionRate}%`),
        el(Bars, { rows: d.funnel }),

        el(Text, { style: s.sectionTitle }, "SERVIÇOS MAIS PROCURADOS"),
        d.services.length
          ? el(Bars, { rows: d.services.map((x) => ({ ...x, color: AZURE })) })
          : el(Text, { style: { fontSize: 9, color: SLATE } }, "Nenhum serviço registrado ainda."),

        el(Text, { style: s.sectionTitle }, "PROPOSTAS RECENTES"),
        d.proposals.length
          ? el(View, null,
              ...d.proposals.map((p, i) =>
                el(View, { style: s.propRow, key: String(i) },
                  el(Text, { style: s.propName }, p.empresa),
                  el(Text, { style: s.propVal }, brl(p.total)),
                  el(Text, { style: s.propDate }, p.date),
                ),
              ),
            )
          : el(Text, { style: { fontSize: 9, color: SLATE } }, "Nenhuma proposta emitida ainda."),
      ),

      el(View, { style: s.footer, fixed: true },
        el(Text, { style: s.footerText }, "Shine Rio · Relatório gerado automaticamente pelo console do agente comercial."),
        el(Text, { style: s.footerText }, "(21) 3540-0693"),
      ),
    ),
  );
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export async function generateReportPdf(data: ReportData): Promise<Buffer> {
  const instance = pdf(ReportDocument({ d: data }) as Parameters<typeof pdf>[0]);
  const result = await instance.toBuffer();
  return Buffer.isBuffer(result) ? result : streamToBuffer(result as unknown as NodeJS.ReadableStream);
}
