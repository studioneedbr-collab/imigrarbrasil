import { describe, it, expect } from "vitest";
import { calcularPreco } from "@/lib/agent/pricing";
import { executeTool } from "@/lib/agent/tools";
import { getRepository } from "@/lib/data";
import { DEFAULT_KNOWLEDGE, buildSystemPrompt } from "@/lib/agent/knowledge";

// Diretriz do Eduardo em 10/08/2026: quando o cliente já fornece o uniforme, a Shayene
// pode refazer o preço sozinha — é item de planilha, não de convenção. Alimentação
// (vale-refeição) NÃO sai: é cláusula da CCT e a Shine paga do mesmo jeito, então esse
// pedido vai para o comercial. Sem essa separação ela cotaria abaixo do custo real.

const ASG = "Auxiliar de Serviços Gerais";
const UNIFORME_ASG = 46.97;

describe("abatimento de uniforme", () => {
  it("sem_uniforme derruba o preço do ASG", () => {
    const cheio = calcularPreco({ serviceName: ASG, employeesCount: 1 });
    const sem = calcularPreco({ serviceName: ASG, employeesCount: 1, semUniforme: true });
    expect(cheio.unitSalePrice).toBeCloseTo(4965.47, 1);
    expect(sem.unitSalePrice).toBeLessThan(cheio.unitSalePrice);
    expect(sem.costBreakdown.uniforme).toBe(0);
  });

  it("o abatimento é o uniforme já com o BDI por cima, não só os R$ 46,97", () => {
    const cheio = calcularPreco({ serviceName: ASG, employeesCount: 1 });
    const sem = calcularPreco({ serviceName: ASG, employeesCount: 1, semUniforme: true });
    const diff = cheio.unitSalePrice - sem.unitSalePrice;
    expect(diff).toBeGreaterThan(UNIFORME_ASG);
    expect(diff).toBeLessThan(UNIFORME_ASG * 1.35);
  });

  it("o resto da composição não se mexe — só o Módulo 5 sai", () => {
    const cheio = calcularPreco({ serviceName: ASG, employeesCount: 1 });
    const sem = calcularPreco({ serviceName: ASG, employeesCount: 1, semUniforme: true });
    expect(sem.costBreakdown.salarioBase).toBe(cheio.costBreakdown.salarioBase);
    // Benefícios = VT + vale-refeição + benefício social. Não muda: é CCT.
    expect(sem.costBreakdown.beneficios).toBe(cheio.costBreakdown.beneficios);
    expect(sem.costBreakdown.encargos).toBe(cheio.costBreakdown.encargos);
  });

  it("sem o flag, o preço é o cheio (o default não abate nada)", () => {
    const a = calcularPreco({ serviceName: ASG, employeesCount: 1 });
    const b = calcularPreco({ serviceName: ASG, employeesCount: 1, semUniforme: false });
    expect(a.unitSalePrice).toBe(b.unitSalePrice);
  });

  it("a tool repassa sem_uniforme e avisa que o abatimento foi aplicado", async () => {
    const cheio = (await executeTool("calcular_preco_servico", {
      service_name: ASG,
      employees_count: 2,
    })) as { totalSalePrice: number; semUniforme?: boolean };
    const sem = (await executeTool("calcular_preco_servico", {
      service_name: ASG,
      employees_count: 2,
      sem_uniforme: true,
    })) as { totalSalePrice: number; semUniforme?: boolean };
    expect(sem.totalSalePrice).toBeLessThan(cheio.totalSalePrice);
    expect(sem.semUniforme).toBe(true);
    expect(cheio.semUniforme).toBeUndefined();
  });

  it("a proposta em PDF aceita sem_uniforme e cota igual ao que foi falado", async () => {
    const semNoPreco = calcularPreco({ serviceName: ASG, employeesCount: 2, semUniforme: true });
    const r = (await executeTool("gerar_proposta_pdf", {
      lead_data: { contact_name: "Teste", company_name: "Condomínio Teste" },
      services: [{ name: ASG, quantity: 2, sem_uniforme: true }],
    })) as { ok?: boolean; proposal_id?: string };
    expect(r.ok).toBe(true);
    const salva = await getRepository().getProposal(r.proposal_id!);
    expect(salva?.totalValue).toBeCloseTo(semNoPreco.totalSalePrice, 1);
  });
});

// REMOVIDO com a troca de domínio (Imigrar Brasil): o describe que existia aqui checava as
// instruções de uniforme e vale-refeição no system prompt do agente comercial. O prompt
// hoje é de imigração e não fala de preço; o cálculo de sem_uniforme continua testado
// acima, direto no motor e na tool.
