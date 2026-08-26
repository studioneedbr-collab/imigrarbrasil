import { describe, it, expect } from "vitest";
import { calcularPreco } from "@/lib/comercial/pricing";

// Motor de preço herdado, hoje a serviço só das telas do painel: quando o cliente já
// fornece o uniforme, o abatimento pode ser feito — é item de planilha, não de convenção.
// Alimentação (vale-refeição) NÃO sai: é cláusula da CCT e é paga do mesmo jeito. Sem essa
// separação a composição sairia abaixo do custo real.

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

  it("o abatimento vale para o contrato inteiro, não só para um posto", () => {
    const cheio = calcularPreco({ serviceName: ASG, employeesCount: 2 });
    const sem = calcularPreco({ serviceName: ASG, employeesCount: 2, semUniforme: true });
    expect(sem.totalSalePrice).toBeLessThan(cheio.totalSalePrice);
    expect(sem.totalSalePrice).toBeCloseTo(sem.unitSalePrice * 2, 1);
  });
});

// REMOVIDO com a troca de domínio (Imigrar Brasil): os casos que existiam aqui passavam
// pelas tools `calcular_preco_servico` e `gerar_proposta_pdf` do agente, que não existem
// mais — a Imigrar Brasil não cota serviço pelo assistente. O motor de preço continua no
// sistema, servindo às telas do painel, e segue testado acima direto em lib/comercial.
