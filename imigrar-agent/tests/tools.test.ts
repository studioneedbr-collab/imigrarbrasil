import { describe, it, expect } from "vitest";
import { executeTool } from "@/lib/agent/tools";
import { getRepository } from "@/lib/data";

describe("executeTool", () => {
  it("calcular_preco_servico retorna preço do ASG", async () => {
    const r: any = await executeTool("calcular_preco_servico", { service_name: "Auxiliar de Serviços Gerais", employees_count: 2 });
    expect(r.totalSalePrice).toBeGreaterThan(9000);
  });
  it("registrar_dados_lead persiste no repo", async () => {
    const conv = await getRepository().getOrCreateConversation("sim:tool-1");
    const r: any = await executeTool("registrar_dados_lead", { conversation_id: conv.id, contact_name: "Ana Teste", employees_needed: 3 });
    expect(r.ok).toBe(true);
    const lead = await getRepository().getLeadByConversation(conv.id);
    expect(lead?.contactName).toBe("Ana Teste");
  });
  it("gerar_proposta_pdf mapeia unit_price->unitPrice e retorna pdf_url", async () => {
    const conv = await getRepository().getOrCreateConversation("sim:tool-2");
    const r: any = await executeTool("gerar_proposta_pdf", {
      conversation_id: conv.id,
      lead_data: { company_name: "Cond. Teste" },
      services: [{ name: "ASG", quantity: 2, unit_price: 4873.52, schedule: "5x2_44h" }],
      total_value: 9747.04,
    });
    expect(r.ok).toBe(true);
    expect(r.pdf_url.startsWith("data:application/pdf;base64,")).toBe(true);
  });
  it("agendar_followup cria followup pendente", async () => {
    const conv = await getRepository().getOrCreateConversation("sim:tool-3");
    const r: any = await executeTool("agendar_followup", { conversation_id: conv.id, message: "Oi, tudo bem?", delay_hours: 24 });
    expect(r.ok).toBe(true);
    const pend = await getRepository().listPendingFollowups();
    expect(pend.some((f) => f.id === r.followup_id)).toBe(true);
  });
});
