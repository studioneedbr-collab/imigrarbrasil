import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calcularPreco } from "@/lib/comercial/pricing";
import type { ServiceSchedule } from "@/lib/domain/types";

const itemSchema = z.object({
  serviceName: z.string(),
  employeesCount: z.number().int().positive(),
  schedule: z.enum(["5x2_44h", "6x1_44h", "12x36"]).optional(),
  // Cobertura do posto: com "24h" a quantidade são POSTOS, e cada um vira 4 funcionários
  // na 12x36 (2 com adicional noturno). Sem isso o painel não reproduz o que a Shayene
  // cota, e o Pedro não tem como conferir o posto 24h fora do WhatsApp.
  cobertura: z.enum(["24h", "12h_diurno", "12h_noturno"]).optional(),
});
const bodySchema = z.object({ items: z.array(itemSchema).min(1) });

// Simulador de orçamento — calcula preço por item (sem gerar PDF). Preview ao vivo.
export async function POST(req: NextRequest) {
  try {
    const { items } = bodySchema.parse(await req.json());
    const lines = items.map((it) => {
      const p = calcularPreco({
        serviceName: it.serviceName,
        employeesCount: it.employeesCount,
        schedule: it.schedule as ServiceSchedule | undefined,
        cobertura: it.cobertura,
      });
      // Preço só é exposto para funções com preço validado (hoje: ASG). As demais
      // saem como "sob consulta" (preço null) e não entram no total.
      return {
        serviceName: p.serviceName,
        employeesCount: it.employeesCount,
        schedule: p.schedule,
        sobConsulta: p.sobConsulta,
        cobertura: p.cobertura,
        funcionariosPorPosto: p.funcionariosPorPosto,
        funcionariosTotais: p.funcionariosTotais,
        coberturaNaoDimensionavel: p.coberturaNaoDimensionavel,
        unitSalePrice: p.sobConsulta ? null : p.unitSalePrice,
        totalSalePrice: p.sobConsulta ? null : p.totalSalePrice,
        costBreakdown: p.costBreakdown,
      };
    });
    const total = lines.reduce((sum, l) => sum + (l.totalSalePrice ?? 0), 0);
    const annual = Math.round(total * 12 * 100) / 100;
    const hasSobConsulta = lines.some((l) => l.sobConsulta);
    return NextResponse.json({ items: lines, total, annual, hasSobConsulta });
  } catch (err) {
    console.error("[quote:POST]", err);
    return NextResponse.json({ error: "Falha ao calcular orçamento" }, { status: 400 });
  }
}
