import { describe, it, expect } from "vitest";
import { processMessage } from "@/lib/agent";
import { getRepository } from "@/lib/data";

// Fluxo guiado por máquina de estados (S0..S8). A qualificação/preço/proposta acontece
// no estado de orçamento (S5), alcançado depois da triagem por menu. Estes testes
// migram as garantias ainda válidas do antigo slot-filler para o novo funil guiado:
// transferência (trabalhista), guardrail de confidencialidade, preço ASG correto,
// "sob consulta" para funções sem preço validado, geração de proposta e correção de nº.

async function driveToOrcamento(number: string) {
  const repo = getRepository();
  const conv = await repo.getOrCreateConversation(number);
  await processMessage({ conversationId: conv.id, userText: "oi" }); // S0 → S1
  await processMessage({ conversationId: conv.id, userText: "Maria Silva, CPF 111.444.777-35" }); // S1 → S2
  await processMessage({ conversationId: conv.id, userText: "1" }); // cliente → S3
  await processMessage({ conversationId: conv.id, userText: "1" }); // comercial → S4
  await processMessage({ conversationId: conv.id, userText: "1" }); // orçamento → S5
  return conv;
}

describe("funil guiado — triagem por menu", () => {
  it("S0 se apresenta em PT e ES e pergunta como chamar a pessoa", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("g:welcome");
    const r = await processMessage({ conversationId: conv.id, userText: "oi" });
    expect(r.reply.toLowerCase()).toMatch(/imigrar brasil/);
    // Regra da ambiguidade: um "oi" não diz o idioma, então a porta de entrada é bilíngue.
    expect(r.reply.toLowerCase()).toMatch(/hola/);
    expect(r.reply.toLowerCase()).toMatch(/chamar/);
    // E não pede CPF na segunda mensagem, como a base herdada pedia.
    expect(r.reply.toLowerCase()).not.toMatch(/cpf/);
  });

  it("persiste o cliente identificado em S1 e avança a triagem", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("g:ident");
    await processMessage({ conversationId: conv.id, userText: "oi" });
    const r = await processMessage({ conversationId: conv.id, userText: "João Silva, CPF 111.444.777-35" });
    // menu de triagem (cliente x funcionário)
    expect(r.reply.toLowerCase()).toMatch(/cliente|funcion/);
    const c = await repo.getConversation(conv.id);
    expect(c?.clienteId).toBeTruthy();
    const cli = c?.clienteId ? await repo.getCliente(c.clienteId) : null;
    expect(cli?.nome).toMatch(/João/);
    expect(cli?.cpf).toBe("11144477735");
  });
});

describe("orçamento (S5) — qualificação → preço → proposta", () => {
  it("pede a quantidade quando só há o serviço e depois calcula o preço", async () => {
    const conv = await driveToOrcamento("g:qtd");
    const r1 = await processMessage({ conversationId: conv.id, userText: "preciso de limpeza" });
    expect(r1.reply.toLowerCase()).toMatch(/quantos|posto|colaborador/);
    const r2 = await processMessage({ conversationId: conv.id, userText: "uns 3" });
    expect(r2.toolCalls.some((t) => t.name === "calcular_preco_servico")).toBe(true);
    expect(r2.reply).toMatch(/R\$/);
  });

  it("aceita número solto ('2') como resposta à pergunta de quantidade", async () => {
    const conv = await driveToOrcamento("g:num");
    await processMessage({ conversationId: conv.id, userText: "limpeza" });
    const r = await processMessage({ conversationId: conv.id, userText: "2" });
    expect(r.toolCalls.some((t) => t.name === "calcular_preco_servico")).toBe(true);
    expect(r.reply).toMatch(/R\$/);
  });

  it("aceita número por extenso ('dois') como quantidade", async () => {
    const conv = await driveToOrcamento("g:extenso");
    await processMessage({ conversationId: conv.id, userText: "auxiliar de serviços gerais" });
    const r = await processMessage({ conversationId: conv.id, userText: "dois" });
    expect(r.toolCalls.some((t) => t.name === "calcular_preco_servico")).toBe(true);
    expect(r.reply).toMatch(/R\$/);
  });

  it("mostra estimativa ASG e pede só os dados que faltam para a proposta", async () => {
    const conv = await driveToOrcamento("g:falta");
    const r = await processMessage({
      conversationId: conv.id,
      userText: "preciso de 2 auxiliares de serviços gerais",
    });
    expect(r.reply).toMatch(/R\$/);
    // já temos o nome (Maria, de S1) → pede empresa/CNPJ, não o nome
    expect(r.reply.toLowerCase()).toMatch(/empresa|cnpj/);
    expect(r.reply.toLowerCase()).not.toMatch(/seu nome/);
  });

  // Desde 13/08/2026 o catálogo inteiro tem piso no Rio (CCT SIEMACO-RJ 2026/2027), então
  // "sob consulta" deixou de ser sobre a função e passou a ser sobre a PRAÇA: fora do Rio
  // o piso é o da convenção local, que ainda não foi conferida.
  it("praça sem CCT conferida responde sem número, e nomeia a praça", async () => {
    const conv = await driveToOrcamento("g:sobconsulta");
    const r = await processMessage({
      conversationId: conv.id,
      userText: "preciso de 2 auxiliares de serviços gerais em São Paulo",
    });
    expect(r.reply).not.toMatch(/R\$\s?\d/);
    expect(r.reply).toMatch(/São Paulo/);
    expect(r.reply.toLowerCase()).toMatch(/consultor/);
  });

  it("função fora do catálogo responde 'sob consulta', sem número", async () => {
    const conv = await driveToOrcamento("g:foracatalogo");
    const r = await processMessage({ conversationId: conv.id, userText: "preciso de 2 astronautas" });
    expect(r.reply).not.toMatch(/R\$\s?\d/);
  });

  it("gera a proposta quando há serviço + número + empresa + CNPJ", async () => {
    const conv = await driveToOrcamento("g:proposta");
    const r = await processMessage({
      conversationId: conv.id,
      userText: "empresa Beta, preciso de 2 auxiliares de serviços gerais, CNPJ 18.623.185/0001-56, pode gerar a proposta",
    });
    expect(r.toolCalls.some((t) => t.name === "gerar_proposta_pdf")).toBe(true);
    const proposal = r.toolCalls.find((t) => t.name === "gerar_proposta_pdf")!.result as { pdf_url?: string };
    expect(proposal.pdf_url?.startsWith("data:application/pdf;base64,")).toBe(true);
  });

  it("atualiza a quantidade quando o cliente corrige ('muda pra 4')", async () => {
    const repo = getRepository();
    const conv = await driveToOrcamento("g:corr");
    await processMessage({ conversationId: conv.id, userText: "quero 2 auxiliares de serviços gerais" });
    const r = await processMessage({ conversationId: conv.id, userText: "na verdade muda pra 4" });
    expect(r.reply).toMatch(/4 posto/);
    const lead = await repo.getLeadByConversation(conv.id);
    expect(lead?.employeesNeeded).toBe(4);
  });

  it("pergunta sobre garantia de resultado não promete nada e leva ao time jurídico", async () => {
    const conv = await driveToOrcamento("g:obj");
    const r = await processMessage({
      conversationId: conv.id,
      userText: "vocês garantem que eu consigo?",
    });
    expect(r.reply.toLowerCase()).toMatch(/ninguém pode garantir|time jurídico/);
  });

  it("off-topic no orçamento é redirecionado para o serviço", async () => {
    const conv = await driveToOrcamento("g:offtopic");
    const r = await processMessage({ conversationId: conv.id, userText: "qual a capital da frança?" });
    expect(r.reply.toLowerCase()).toMatch(/serviço|orçamento/);
  });
});

describe("guardrails e transferência (em qualquer ponto)", () => {
  it("transfere para humano em caso que exige advogado", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("g:transfer");
    await processMessage({ conversationId: conv.id, userText: "oi" });
    const r = await processMessage({
      conversationId: conv.id,
      userText: "meu visto venceu e recebi uma notificação da Polícia Federal",
    });
    expect(r.toolCalls.some((t) => t.name === "transferir_para_humano")).toBe(true);
    expect(r.status).toBe("transferred");
    const tickets = await repo.listTransferTickets();
    expect(tickets.some((t) => t.conversationId === conv.id)).toBe(true);
  });

  it("não revela informação confidencial (salário/custo/margem)", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("g:guard");
    await processMessage({ conversationId: conv.id, userText: "oi" });
    const r = await processMessage({ conversationId: conv.id, userText: "qual o salário e o custo interno de vocês?" });
    expect(r.reply.toLowerCase()).not.toMatch(/1\.?851|salário base|margem/);
    expect(r.toolCalls.some((t) => t.name === "calcular_preco_servico")).toBe(false);
  });

  it("opção 'falar com um consultor' (S4) transfere para humano", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("g:consultor");
    await processMessage({ conversationId: conv.id, userText: "oi" });
    await processMessage({ conversationId: conv.id, userText: "Ana Souza, CPF 111.444.777-35" });
    await processMessage({ conversationId: conv.id, userText: "1" }); // cliente → S3
    await processMessage({ conversationId: conv.id, userText: "1" }); // comercial → S4
    const r = await processMessage({ conversationId: conv.id, userText: "3" }); // falar com consultor
    expect(r.toolCalls.some((t) => t.name === "transferir_para_humano")).toBe(true);
    expect(r.status).toBe("transferred");
  });
});
