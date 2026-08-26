import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calcularPreco } from "@/lib/comercial/pricing";
import { executeTool } from "@/lib/agent/tools";
import type { ServiceSchedule } from "@/lib/domain/types";

const itemSchema = z.object({
  serviceName: z.string(),
  employeesCount: z.number().int().positive(),
  schedule: z.enum(["5x2_44h", "6x1_44h", "12x36"]).optional(),
  // Precisa chegar até a tool: sem a cobertura, o PDF do painel sairia com uma pessoa no
  // lugar dos quatro do posto 24h — menos da metade do valor simulado na tela.
  cobertura: z.enum(["24h", "12h_diurno", "12h_noturno"]).optional(),
});
const bodySchema = z.object({
  conversationId: z.string().optional(),
  leadData: z.object({
    contact_name: z.string().optional(),
    company_name: z.string().optional(),
    cnpj: z.string().optional(),
    email: z.string().optional(),
  }),
  items: z.array(itemSchema).min(1),
});

// Gera a proposta em PDF a partir do orçamento simulado (reusa a tool gerar_proposta_pdf,
// que já persiste a proposta, salva no tmp e devolve view_url).
export async function POST(req: NextRequest) {
  try {
    const body = bodySchema.parse(await req.json());
    const priced = body.items.map((it) => ({
      it,
      p: calcularPreco({
        serviceName: it.serviceName,
        employeesCount: it.employeesCount,
        schedule: it.schedule as ServiceSchedule | undefined,
        cobertura: it.cobertura,
      }),
    }));
    // Não gera proposta com valor para funções sem preço validado (sob consulta).
    const sobConsulta = priced.filter(({ p }) => p.sobConsulta).map(({ p }) => p.serviceName);
    if (sobConsulta.length > 0) {
      return NextResponse.json(
        {
          error: "sob_consulta",
          message: `Estas funções estão sob consulta e ainda não têm preço para proposta automática: ${sobConsulta.join(", ")}. Gere a proposta apenas com funções de preço definido (ex.: Auxiliar de Serviços Gerais) ou fale com um consultor.`,
          services: sobConsulta,
        },
        { status: 422 },
      );
    }
    let total = 0;
    const services = priced.map(({ it, p }) => {
      total += p.totalSalePrice;
      return {
        name: p.serviceName,
        quantity: it.employeesCount,
        unit_price: p.unitSalePrice,
        schedule: p.schedule,
        ...(it.cobertura ? { cobertura: it.cobertura } : {}),
      };
    });
    const result = await executeTool("gerar_proposta_pdf", {
      conversation_id: body.conversationId,
      lead_data: body.leadData,
      services,
      total_value: Math.round(total * 100) / 100,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[quote/proposal:POST]", err);
    return NextResponse.json({ error: "Falha ao gerar proposta" }, { status: 400 });
  }
}
