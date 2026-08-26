import React from "react";
import fs from "fs";
import path from "path";
import { Document, Page, Text, View, Image, StyleSheet, pdf } from "@react-pdf/renderer";
import type { ProposalServiceLine } from "@/lib/domain/types";
import { dimensionar, descreverPosto } from "@/lib/comercial/dimensionamento";

export interface ProposalInput {
  leadData: { contact_name?: string; company_name?: string; whatsapp_number?: string; email?: string; cnpj?: string; address?: string };
  services: ProposalServiceLine[];
  totalValue: number;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const el = React.createElement;

// Paleta minimalista: quase-preto + cinzas + um único acento.
const INK = "#1B2430"; // títulos e valores
const BODY = "#57616D"; // texto corrido
const MUTE = "#9AA3AE"; // rótulos e apoio
const HAIR = "#EAEDF1"; // réguas finas
const ACCENT = "#23B5D3"; // único acento de cor

let LOGO_DATA_URI: string | null = null;
function getLogo(): string | null {
  if (LOGO_DATA_URI !== null) return LOGO_DATA_URI || null;
  try {
    const p = path.join(process.cwd(), "public", "shinelogo.png");
    LOGO_DATA_URI = `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
  } catch {
    LOGO_DATA_URI = "";
  }
  return LOGO_DATA_URI || null;
}

const s = StyleSheet.create({
  page: { paddingTop: 46, paddingBottom: 50, paddingHorizontal: 56, fontSize: 9.5, fontFamily: "Helvetica", color: BODY, lineHeight: 1.5 },

  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 104, height: 40, objectFit: "contain" },
  brandFallback: { fontSize: 17, color: INK, fontFamily: "Helvetica-Bold", letterSpacing: 2 },
  topRight: { alignItems: "flex-end" },
  eyebrow: { fontSize: 7.5, color: MUTE, letterSpacing: 2.5 },
  ref: { fontSize: 8.5, color: INK, marginTop: 5 },
  date: { fontSize: 8.5, color: MUTE, marginTop: 1 },

  hair: { height: 1, backgroundColor: HAIR, marginTop: 18 },

  heroLabel: { marginTop: 24, fontSize: 7.5, color: MUTE, letterSpacing: 2 },
  heroName: { marginTop: 8, fontSize: 23, color: INK, letterSpacing: -0.3, lineHeight: 1.15 },
  heroMeta: { marginTop: 12, fontSize: 8.5, color: MUTE },

  sectionLabel: { marginTop: 20, marginBottom: 12, fontSize: 7.5, color: MUTE, letterSpacing: 2 },

  thead: { flexDirection: "row", borderBottom: `1 solid ${INK}`, paddingBottom: 7 },
  th: { fontSize: 7, color: MUTE, letterSpacing: 1 },
  tr: { flexDirection: "row", paddingVertical: 8, borderBottom: `1 solid ${HAIR}` },
  cService: { flex: 3.4 },
  cServiceName: { color: INK, fontFamily: "Helvetica-Bold" },
  // Dimensionamento do posto: o cliente pediu "1 posto 24h" e é assim que a linha aparece
  // — mas ele precisa ler, por escrito, que ali dentro vão quatro funcionários e que dois
  // recebem adicional noturno. É o que sustenta o valor quando ele comparar com o
  // concorrente que cotou duas pessoas.
  cServiceNote: { color: MUTE, fontSize: 8, marginTop: 2 },
  cScale: { flex: 2, color: MUTE },
  cQtd: { flex: 1, textAlign: "center", color: BODY },
  cUnit: { flex: 2, textAlign: "right", color: MUTE },
  cTotal: { flex: 2, textAlign: "right", color: INK, fontFamily: "Helvetica-Bold" },

  totalWrap: { marginTop: 18, flexDirection: "row", justifyContent: "flex-end" },
  totalBox: { width: 230, alignItems: "flex-end" },
  accentBar: { height: 2, width: 32, backgroundColor: ACCENT, marginBottom: 11 },
  totalLabel: { fontSize: 7.5, color: MUTE, letterSpacing: 1.5 },
  totalValue: { fontSize: 28, color: INK, fontFamily: "Helvetica-Bold", marginTop: 4, lineHeight: 1.05 },
  totalSub: { width: "100%", flexDirection: "row", justifyContent: "space-between", marginTop: 11, borderTop: `1 solid ${HAIR}`, paddingTop: 8 },
  subLabel: { fontSize: 8, color: MUTE },
  subValue: { fontSize: 8.5, color: INK, fontFamily: "Helvetica-Bold" },
  validity: { marginTop: 7, fontSize: 7.5, color: MUTE },

  inclLabel: { marginTop: 18, marginBottom: 6, fontSize: 7.5, color: MUTE, letterSpacing: 2 },
  inclGrid: { flexDirection: "row", flexWrap: "wrap" },
  inclRow: { width: "50%", flexDirection: "row", marginTop: 8, paddingRight: 22 },
  inclMark: { width: 13, fontSize: 9, color: ACCENT },
  inclText: { flex: 1, fontSize: 8.5, color: BODY, lineHeight: 1.4 },

  stats: { marginTop: 18, flexDirection: "row", borderTop: `1 solid ${HAIR}`, borderBottom: `1 solid ${HAIR}`, paddingVertical: 12 },
  stat: { flex: 1 },
  statNum: { fontSize: 18, color: INK, fontFamily: "Helvetica-Bold", lineHeight: 1.1 },
  statLabel: { fontSize: 6.8, color: MUTE, letterSpacing: 0.6, marginTop: 4 },

  sign: { marginTop: 16 },
  signLine: { width: 210, height: 1, backgroundColor: INK, marginBottom: 6 },
  signName: { fontSize: 8.5, color: INK, fontFamily: "Helvetica-Bold" },
  signRole: { fontSize: 8, color: MUTE, marginTop: 1 },

  footer: { position: "absolute", bottom: 30, left: 56, right: 56, borderTop: `1 solid ${HAIR}`, paddingTop: 9, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 6.5, color: MUTE, letterSpacing: 0.3 },
});

function proposalRef(): string {
  const d = new Date();
  return `SR-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

const INCLUSO = [
  "Seleção, captação e treinamento dos profissionais pela Mesa de Operação Shine Rio.",
  "Uniformes, EPIs, materiais e equipamentos inclusos, sem custo de setup surpresa.",
  "Supervisão contínua e reposição rápida em caso de falta.",
  "Gestão trabalhista em conformidade (folha, encargos e benefícios por nossa conta).",
];

const STATS = [
  { num: "13", label: "ANOS DE OPERAÇÃO" },
  { num: "378", label: "COLABORADORES ATIVOS" },
  { num: "32", label: "CLIENTES ATENDIDOS" },
];

function ProposalDocument({ input, dateStr }: { input: ProposalInput; dateStr: string }) {
  const logo = getLogo();
  const annual = input.totalValue * 12;
  const cliente = input.leadData.company_name ?? input.leadData.contact_name ?? "Cliente";
  const metaParts = [
    input.leadData.contact_name && input.leadData.company_name ? `A/C ${input.leadData.contact_name}` : null,
    input.leadData.cnpj ? `CNPJ/CPF ${input.leadData.cnpj}` : null,
    input.leadData.email || null,
  ].filter(Boolean) as string[];

  const rows = input.services.map((line, i) => {
    const sob = !line.unitPrice || line.unitPrice <= 0;
    const dim = line.cobertura ? dimensionar(line.cobertura) : undefined;
    return el(View, { style: s.tr, key: String(i) },
      el(View, { style: s.cService },
        el(Text, { style: s.cServiceName }, dim ? `${dim.rotulo} — ${line.name}` : line.name),
        dim ? el(Text, { style: s.cServiceNote }, descreverPosto(dim, line.quantity)) : null,
      ),
      el(Text, { style: s.cScale }, line.schedule ?? "—"),
      el(Text, { style: s.cQtd }, String(line.quantity)),
      el(Text, { style: s.cUnit }, sob ? "Sob consulta" : brl(line.unitPrice)),
      el(Text, { style: s.cTotal }, sob ? "—" : brl(line.unitPrice * line.quantity)),
    );
  });

  return el(Document, null,
    el(Page, { size: "A4", style: s.page },
      // Cabeçalho
      el(View, { style: s.top },
        logo ? el(Image, { style: s.logo, src: logo }) : el(Text, { style: s.brandFallback }, "SHINE RIO"),
        el(View, { style: s.topRight },
          el(Text, { style: s.eyebrow }, "PROPOSTA COMERCIAL"),
          el(Text, { style: s.ref }, `Nº ${proposalRef()}`),
          el(Text, { style: s.date }, dateStr),
        ),
      ),
      el(View, { style: s.hair }),

      // Destinatário (herói)
      el(Text, { style: s.heroLabel }, "PREPARADA PARA"),
      el(Text, { style: s.heroName }, cliente),
      metaParts.length ? el(Text, { style: s.heroMeta }, metaParts.join("      ")) : null,

      // Escopo
      el(Text, { style: s.sectionLabel }, "ESCOPO E INVESTIMENTO"),
      el(View, { style: s.thead },
        el(Text, { style: [s.th, s.cService] }, "SERVIÇO"),
        el(Text, { style: [s.th, s.cScale] }, "ESCALA"),
        el(Text, { style: [s.th, s.cQtd] }, "POSTOS"),
        el(Text, { style: [s.th, s.cUnit] }, "UNITÁRIO/MÊS"),
        el(Text, { style: [s.th, s.cTotal] }, "TOTAL/MÊS"),
      ),
      ...rows,

      // Total (número grande, minimalista)
      el(View, { style: s.totalWrap },
        el(View, { style: s.totalBox },
          el(View, { style: s.accentBar }),
          el(Text, { style: s.totalLabel }, "INVESTIMENTO MENSAL"),
          el(Text, { style: s.totalValue }, brl(input.totalValue)),
          el(View, { style: s.totalSub },
            el(Text, { style: s.subLabel }, "Estimativa anual"),
            el(Text, { style: s.subValue }, brl(annual)),
          ),
          el(Text, { style: s.validity }, "Proposta válida por 24 horas · início a combinar"),
        ),
      ),

      // Incluso (2 colunas)
      el(Text, { style: s.inclLabel }, "O QUE ESTÁ INCLUSO"),
      el(View, { style: s.inclGrid },
        ...INCLUSO.map((t, i) =>
          el(View, { style: s.inclRow, key: String(i) },
            el(Text, { style: s.inclMark }, "—"),
            el(Text, { style: s.inclText }, t),
          ),
        ),
      ),

      // Credibilidade (números)
      el(View, { style: s.stats },
        ...STATS.map((st, i) =>
          el(View, { style: s.stat, key: String(i) },
            el(Text, { style: s.statNum }, st.num),
            el(Text, { style: s.statLabel }, st.label),
          ),
        ),
      ),

      // Assinatura
      el(View, { style: s.sign },
        el(View, { style: s.signLine }),
        el(Text, { style: s.signName }, "Equipe Comercial · Shine Rio"),
        el(Text, { style: s.signRole }, "Guido Doro / Pedro Lucas · (21) 3540-0693 · comercial@shinerio.com"),
      ),

      // Rodapé
      el(View, { style: s.footer, fixed: true },
        el(Text, { style: s.footerText }, "SHINE RIO SERVIÇOS LTDA · CNPJ 18.623.185/0001-56"),
        el(Text, { style: s.footerText }, "Valores estimados · Botafogo, Rio de Janeiro/RJ"),
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

export async function generateProposalPdf(input: ProposalInput): Promise<{ buffer: Buffer; filename: string }> {
  const dateStr = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const instance = pdf(ProposalDocument({ input, dateStr }) as Parameters<typeof pdf>[0]);
  const result = await instance.toBuffer();
  const buffer: Buffer = Buffer.isBuffer(result)
    ? result
    : await streamToBuffer(result as unknown as NodeJS.ReadableStream);
  const filename = `Proposta-Shine-Rio-${(input.leadData.company_name ?? "cliente").replace(/\s+/g, "-").toLowerCase()}.pdf`;
  return { buffer, filename };
}
