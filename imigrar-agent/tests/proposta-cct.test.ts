import { describe, it, expect } from "vitest";
import { executeTool, AGENT_TOOLS } from "@/lib/agent/tools";

// A Shayene enviou uma proposta de R$ 1.500 para um posto que custa R$ 4.965,47. A tool
// gravava no PDF o unit_price/total_value que o MODELO escrevia — as travas de preço
// estavam todas em calcular_preco_servico, e a proposta era um caminho paralelo sem
// nenhuma conferência. Agora todo valor é recalculado aqui pela composição da CCT.

const LEAD = { contact_name: "Guido", company_name: "Condomínio Teste", cnpj: "40.390.866/0001-70" };
const ASG = "Auxiliar de Serviços Gerais";

describe("a proposta é sempre recalculada pela CCT", () => {
  it("ignora o preço que o modelo mandar e usa o da composição de custos", async () => {
    const r = (await executeTool("gerar_proposta_pdf", {
      lead_data: LEAD,
      services: [{ name: ASG, quantity: 1, unit_price: 1500, schedule: "5x2_44h" }],
      total_value: 1500, // o número inventado que gerou o problema
    })) as Record<string, unknown>;

    expect(r.ok).toBe(true);
    const proposta = await import("@/lib/data").then((m) => m.getRepository().getProposal(r.proposal_id as string));
    expect(proposta?.totalValue).toBeCloseTo(4965.47, 1);
    expect(proposta?.services[0].unitPrice).toBeCloseTo(4965.47, 1);
  });

  it("multiplica pela quantidade de postos", async () => {
    const r = (await executeTool("gerar_proposta_pdf", {
      lead_data: LEAD,
      services: [{ name: ASG, quantity: 3 }],
      total_value: 10,
    })) as Record<string, unknown>;
    const proposta = await import("@/lib/data").then((m) => m.getRepository().getProposal(r.proposal_id as string));
    expect(proposta?.totalValue).toBeCloseTo(4965.47 * 3, 1);
  });

  it("recusa função fora do catálogo, em vez de cotar", async () => {
    const r = (await executeTool("gerar_proposta_pdf", {
      lead_data: LEAD,
      services: [{ name: "Astronauta", quantity: 2, unit_price: 1500 }],
      total_value: 3000,
    })) as Record<string, unknown>;

    expect(r.ok).toBe(false);
    expect(r.error).toBe("sob_consulta");
    expect(r.items).toContain("Astronauta");
    expect(String(r.motivo)).toMatch(/n[ãa]o invente pre[çc]o/i);
  });

  // O catálogo inteiro tem piso no Rio desde 13/08/2026, mas a praça de fora continua
  // travada — e uma linha travada derruba a proposta inteira, não só aquela linha.
  it("recusa a proposta inteira se UMA das linhas não tiver preço", async () => {
    const r = (await executeTool("gerar_proposta_pdf", {
      lead_data: LEAD,
      services: [{ name: ASG, quantity: 1 }, { name: "Astronauta", quantity: 1 }],
    })) as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect(r.error).toBe("sob_consulta");
  });

  it("recusa a proposta inteira quando a praça não tem CCT conferida", async () => {
    const r = (await executeTool("gerar_proposta_pdf", {
      lead_data: LEAD,
      region: "São Paulo",
      services: [{ name: ASG, quantity: 2 }],
    })) as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect(r.error).toBe("sob_consulta");
  });

  it("recusa linha de material ou equipamento — isso é humano", async () => {
    for (const nome of ["Material de limpeza", "Equipamentos", "material"]) {
      const r = (await executeTool("gerar_proposta_pdf", {
        lead_data: LEAD,
        services: [{ name: nome, quantity: 1, unit_price: 500 }],
      })) as Record<string, unknown>;
      expect(r.ok, nome).toBe(false);
      expect(r.error, nome).toBe("nao_cotavel");
    }
  });
});

describe("apelido de função não vira recusa à toa", () => {
  // Sem isso, "ASG" (que a própria base de conhecimento usa) não acharia o cadastro e a
  // única função cotável do sistema seria empurrada para o humano.
  it.each(["ASG", "asg", "Auxiliar de Servicos Gerais", "auxiliar de serviços gerais"])(
    "%s resolve para o cadastro e cota certo",
    async (nome) => {
      const r = (await executeTool("gerar_proposta_pdf", {
        lead_data: LEAD,
        services: [{ name: nome, quantity: 1 }],
      })) as Record<string, unknown>;
      expect(r.ok).toBe(true);
      const p = await import("@/lib/data").then((m) => m.getRepository().getProposal(r.proposal_id as string));
      expect(p?.totalValue).toBeCloseTo(4965.47, 1);
      expect(p?.services[0].name).toBe(ASG);
    },
  );

  it("função que não existe continua sendo recusada, não chutada", async () => {
    const r = (await executeTool("gerar_proposta_pdf", {
      lead_data: LEAD,
      services: [{ name: "Astronauta Predial", quantity: 1 }],
    })) as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect(r.error).toBe("sob_consulta");
  });
});

// A região tem que chegar até a proposta. Antes ela era ignorada no recálculo e o PDF
// saía sempre com o preço do Rio, mesmo depois de a Shayene cotar outra praça na conversa.
// Hoje a única praça com CCT cadastrada é o Rio: fora dele a proposta recusa, e é essa
// recusa que prova que a região chegou.
describe("a proposta respeita a CCT da praça", () => {
  async function totalDaProposta(input: Record<string, unknown>): Promise<number> {
    const r = (await executeTool("gerar_proposta_pdf", input)) as Record<string, unknown>;
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const p = await import("@/lib/data").then((m) => m.getRepository().getProposal(r.proposal_id as string));
    return p!.totalValue;
  }

  it("São Paulo não gera proposta automática — a CCT de lá não está cadastrada", async () => {
    const r = (await executeTool("gerar_proposta_pdf", {
      lead_data: LEAD, region: "São Paulo", services: [{ name: ASG, quantity: 1 }],
    })) as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect(r.error).toBe("sob_consulta");
  });

  it("a conversa e a proposta concordam: se uma recusa, a outra recusa", async () => {
    const cotacao = (await executeTool("calcular_preco_servico", {
      service_name: ASG, employees_count: 2, region: "São Paulo",
    })) as { sobConsulta: boolean; totalSalePrice?: number };
    expect(cotacao.sobConsulta).toBe(true);
    expect(cotacao.totalSalePrice).toBeUndefined();

    const proposta = (await executeTool("gerar_proposta_pdf", {
      lead_data: LEAD, region: "São Paulo", services: [{ name: ASG, quantity: 2 }],
    })) as Record<string, unknown>;
    expect(proposta.ok).toBe(false);
  });

  it("sem região no input, usa a que já está registrada no lead", async () => {
    const repo = await import("@/lib/data").then((m) => m.getRepository());
    const conv = await repo.getOrCreateConversation("sim:regiao-do-lead");
    await repo.upsertLead(conv.id, { region: "São Paulo" });
    // Sem a região do lead isto cairia no Rio e geraria proposta de R$ 4.965,47.
    const r = (await executeTool("gerar_proposta_pdf", {
      conversation_id: conv.id, lead_data: LEAD, services: [{ name: ASG, quantity: 1 }],
    })) as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect(r.error).toBe("sob_consulta");
  });

  it("sem região em lugar nenhum, continua caindo no Rio", async () => {
    const total = await totalDaProposta({ lead_data: LEAD, services: [{ name: ASG, quantity: 1 }] });
    expect(total).toBeCloseTo(4965.47, 1);
  });

  it("praça do Rio escrita de outro jeito também cota", async () => {
    const total = await totalDaProposta({
      lead_data: LEAD, region: "Niterói", services: [{ name: ASG, quantity: 1 }],
    });
    expect(total).toBeCloseTo(4965.47, 1);
  });
});

describe("o modelo não tem como informar preço", () => {
  it("o schema da tool não expõe campo de valor", () => {
    const tool = AGENT_TOOLS.find((t) => t.name === "gerar_proposta_pdf")!;
    const props = tool.input_schema.properties as Record<string, unknown>;
    expect(props).not.toHaveProperty("total_value");
    const linha = (props.services as { items: { properties: Record<string, unknown> } }).items.properties;
    expect(linha).not.toHaveProperty("unit_price");
    expect(linha).toHaveProperty("name");
    expect(linha).toHaveProperty("quantity");
  });
});
