import { getRepository } from "@/lib/data";
import { executeTool } from "@/lib/agent/tools";
import { extractSlots, parseCount, type LeadSlots } from "@/lib/agent/qualification";
import { extractCpf, isValidCpf } from "@/lib/domain/cpf";
import { detectTransfer, buildDossie } from "@/lib/agent/transfer";
import { findObjection } from "@/lib/agent/knowledge";
import { getTrainingConfig } from "@/lib/agent/system-prompt";
import { STATES, CLOSING } from "@/lib/agent/flow/states";
import { mapFreeText } from "@/lib/agent/flow/nlu";
import { detectarCobertura } from "@/lib/agent/dimensionamento";
import type { AgentTurn, ToolCallTrace, AgentRunResult } from "@/lib/agent/runner";
import type { FlowStateId, Conversation } from "@/lib/domain/types";

// Quem recebe o encaminhamento. Sem telefone: o número direto do time jurídico não foi
// definido pelo cliente, e inventar um contato é pior do que não dar nenhum.
const CONTATO = "Time jurídico — Imigrar Brasil";
const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function listaPt(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

// Extrai um nome próprio da mensagem de identificação (estado S1), descartando a
// porção do CPF/dígitos. Aceita "João Silva, CPF 111..." ou "meu nome é João Silva".
function extractIdentityName(raw: string, slots: LeadSlots): string | undefined {
  if (slots.name) return slots.name;
  const t = raw
    .replace(/\bcpf\b.*/i, " ")
    .replace(/[\d][\d.\-/\s]{5,}/g, " ")
    .replace(/[,;.].*$/, " ")
    .trim();
  const connectors = new Set(["e", "meu", "nome", "é", "eh", "sou", "o", "a", "cpf", "aqui", "quem", "fala"]);
  const parts = t
    .split(/\s+/)
    .filter((w) => /^[A-Za-zÀ-ú][A-Za-zÀ-ú'.-]*$/.test(w) && !connectors.has(w.toLowerCase()));
  if (!parts.length) return undefined;
  const name = parts
    .slice(0, 3)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
  return name || undefined;
}

// Correção de número na última mensagem ("muda pra 4", "na verdade são 3").
function detectNumberCorrection(lastRaw: string): number | undefined {
  const corr = lastRaw
    .toLowerCase()
    .match(
      /(?:muda(?:r)? (?:pra|para)|troca(?:r)? (?:pra|para)|coloca|na verdade\s*(?:s[aã]o|é|eh)?|corrig\w*|passa (?:pra|para))\s*(\d{1,3})/,
    );
  if (corr) {
    const n = Number(corr[1]);
    if (n > 0 && n < 1000) return n;
  }
  return undefined;
}

function isConfidentialAsk(text: string, termos: string[]): boolean {
  const t = text.toLowerCase();
  return termos.some((term) => t.includes(term.toLowerCase()));
}

/**
 * Núcleo determinístico do agente, dirigido pela máquina de estados S0..S8.
 * Roda idêntico com ou sem chave de API (o DeepSeek apenas reescreve o texto).
 * Persiste estado/cliente/lead/tickets e devolve { reply, toolCalls } — o
 * processMessage() acrescenta as mensagens e computa o status.
 */
export async function runEngine({
  history,
  conversationId,
}: {
  history: AgentTurn[];
  conversationId: string;
}): Promise<AgentRunResult> {
  const repo = getRepository();
  const toolCalls: ToolCallTrace[] = [];
  const call = async (name: string, input: Record<string, unknown>) => {
    const result = await executeTool(name, { conversation_id: conversationId, ...input });
    toolCalls.push({ name, input, result });
    return result;
  };

  // Objeções, guardrails e regras de encaminhamento vêm do painel (/dashboard/treinar).
  // Uma leitura por turno: o motor determinístico responde com o que a equipe editou, e
  // não com a lista congelada no código.
  const training = await getTrainingConfig();

  const conv = await repo.getConversation(conversationId);
  const estado: FlowStateId = conv?.estadoAtual ?? "S0";
  const allUserText = history.filter((h) => h.role === "user").map((h) => h.content).join("  ");
  const lastRaw = history[history.length - 1]?.content ?? "";

  const slots = extractSlots(allUserText);
  const cpf = extractCpf(allUserText);

  const setEstado = async (s: FlowStateId) => {
    if (s !== estado) await repo.setEstado(conversationId, s);
  };

  const doTransfer = async (categoria: string, resposta: string): Promise<AgentRunResult> => {
    const existingLead = await repo.getLeadByConversation(conversationId);
    const cliente = conv?.clienteId ? await repo.getCliente(conv.clienteId) : null;
    const summary = allUserText.slice(0, 400);
    await call("transferir_para_humano", {
      reason: categoria,
      summary,
      priority: "normal",
    });
    await repo.setHandoff(conversationId, CONTATO, categoria);
    await repo.createTransferTicket({
      conversationId,
      clienteId: conv?.clienteId,
      reason: categoria,
      priority: "normal",
      dossie: buildDossie({
        cliente: cliente ?? undefined,
        lead: existingLead ?? undefined,
        necessidade: lastRaw.slice(0, 200),
        historicoResumo: summary,
      }),
    });
    return {
      reply: `${resposta}\n\nJá deixei o seu caso com o nosso time jurídico. Continuo por aqui se precisar.`,
      toolCalls,
    };
  };

  // ─── 1) GUARDRAIL: informação confidencial (roda ANTES de transfer e avanço) ───
  if (isConfidentialAsk(lastRaw, training.guardrails.termos)) {
    return {
      reply:
        "Essa informação quem passa é o nosso time jurídico, não consigo te adiantar por aqui. Mas posso te ajudar a entender o que a Imigrar Brasil faz e encaminhar você para eles. O que você precisa resolver?",
      toolCalls,
    };
  }

  // ─── 2) TRANSFERÊNCIA para humano (assunto que exige especialista) ───
  const transfer = detectTransfer(lastRaw, training.transferRules);
  if (transfer) {
    return doTransfer(transfer.categoria, transfer.resposta);
  }

  // ─── 2b) Escape explícito: falar com humano a qualquer momento ───
  if (
    /\bfalar com (?:um |uma )?(?:consultor|atendente|humano|pessoa|algu[ée]m|especialista|vendedor|respons[áa]vel)\b|\bquero (?:falar com |um |uma )?(?:atendente|humano|consultor)\b|\bme transfere\b|\bum atendente\b|\bconsultor\b/i.test(
      lastRaw,
    )
  ) {
    return doTransfer(
      "consultor_comercial",
      "Claro! Já peço para alguém do nosso time jurídico falar com você.",
    );
  }

  // ─── 2c) Pedido de esclarecimento ("não entendi", "pode repetir") ───
  if (
    estado !== "S0" &&
    /n[ãa]o entend|pode repetir|repete (?:por favor|isso|a[íi])|como assim|explica (?:de novo|melhor|isso)|n[ãa]o compreend|n[ãa]o saquei|o que (?:voc[êe]|vc) (?:falou|disse|quis dizer)/i.test(
      lastRaw,
    )
  ) {
    return {
      reply: `Desculpa, deixa eu explicar melhor 😊\n\n${STATES[estado].message}\n\nSe preferir, é só digitar *consultor* que eu te passo para uma pessoa.`,
      toolCalls,
    };
  }

  // ─── 3) OBJEÇÃO (exceto quando estamos coletando a identificação em S1) ───
  if (estado !== "S1") {
    const obj = findObjection(
      lastRaw,
      training.objections.filter((o) => o.ativo),
    );
    if (obj) {
      return {
        reply: `${obj.resposta} Posso seguir e te ajudar com a estimativa ou tirar alguma outra dúvida?`,
        toolCalls,
      };
    }
  }

  // ─── 4) AVANÇO DA MÁQUINA DE ESTADOS ───

  // S0 — boas-vindas e coleta de identificação.
  if (estado === "S0") {
    await setEstado("S1");
    return {
      reply: `${STATES.S0.message}\n\n${STATES.S1.message}`,
      toolCalls,
    };
  }

  // S1 — identidade (nome + CPF). Avança para S2 mesmo sem CPF.
  if (estado === "S1") {
    const nome = extractIdentityName(lastRaw, slots);
    const cliente = await repo.upsertCliente({
      id: conv?.clienteId,
      nome,
      cpf: cpf && isValidCpf(cpf) ? cpf : undefined,
      empresa: slots.company,
    });
    await repo.updateConversation(conversationId, { clienteId: cliente.id });
    if (nome) await repo.updateConversation(conversationId, { contactName: nome });
    await repo.upsertLead(conversationId, {
      clienteId: cliente.id,
      contactName: nome ?? undefined,
      companyName: slots.company ?? undefined,
      stage: "qualificado",
    });
    await setEstado("S2");
    return { reply: STATES.S2.message, toolCalls };
  }

  // S2 — triagem: cliente x funcionário.
  if (estado === "S2") {
    const t = lastRaw.trim();
    const mapped = mapFreeText("S2", lastRaw);
    if (t === "1" || mapped.state === "S3") {
      await setEstado("S3");
      return { reply: STATES.S3.message, toolCalls };
    }
    if (t === "2" || /funcion[áa]rio|colaborador|suporte interno|sou de dentro/i.test(t)) {
      await setEstado("S10");
      return { reply: STATES.S10.message, toolCalls };
    }
    return { reply: `Não entendi. Escolha uma opção:\n${STATES.S2.message}`, toolCalls };
  }

  // S3 — setor: Comercial x Operacional/RH.
  if (estado === "S3") {
    const t = lastRaw.trim();
    if (t === "1" || /comercial|vendas|contratar/i.test(t)) {
      await setEstado("S4");
      return { reply: STATES.S4.message, toolCalls };
    }
    if (t === "2" || /operacional/i.test(t)) {
      await setEstado("S9");
      return { reply: STATES.S9.message, toolCalls };
    }
    if (t === "3" || /recursos humanos|\brh\b/i.test(t)) {
      // RH ainda fora do escopo atual: registra e encerra cordialmente.
      return { reply: CLOSING, toolCalls };
    }
    return { reply: `Não entendi. Escolha uma opção:\n${STATES.S3.message}`, toolCalls };
  }

  // S4 — menu comercial.
  if (estado === "S4") {
    const t = lastRaw.trim();
    if (t === "1" || /or[çc]amento|or[çc]ar|cota[çc]/i.test(t)) {
      await setEstado("S5");
      return { reply: STATES.S5.message, toolCalls };
    }
    if (t === "2" || /conhecer|servi[çc]o|portf[óo]lio/i.test(t)) {
      await setEstado("S6");
      return { reply: STATES.S6.message, toolCalls };
    }
    if (t === "3" || /consultor|falar com/i.test(t)) {
      return doTransfer("consultor_comercial", STATES.S7.message);
    }
    if (t === "4" || /renova[çc]|altera[çc]/i.test(t)) {
      return doTransfer("contratos", STATES.S8.message);
    }
    return { reply: `Não entendi. Escolha uma opção:\n${STATES.S4.message}`, toolCalls };
  }

  // S5 — orçamento: coleta escopo, precifica (ASG) ou "sob consulta", gera proposta.
  if (estado === "S5") {
    return runOrcamento({ repo, call, conversationId, conv, slots, lastRaw, allUserText, toolCalls });
  }

  // S6 — conhecer serviços: responde sobre o portfólio; intenção de compra → S5.
  if (estado === "S6") {
    if (slots.service || /or[çc]amento|contratar|pre[çc]o|quanto custa|valor/i.test(lastRaw)) {
      await setEstado("S5");
      return runOrcamento({ repo, call, conversationId, conv, slots, lastRaw, allUserText, toolCalls });
    }
    return {
      reply:
        "A Imigrar Brasil é uma assessoria jurídica em imigração para o Brasil: visto solicitado no exterior, regularização de quem já está aqui, naturalização, refúgio, residência pelo Mercosul e reunião familiar. Sobre qual desses você quer falar?",
      toolCalls,
    };
  }

  // S9 — menu do setor Operacional.
  if (estado === "S9") {
    const t = lastRaw.trim();
    if (t === "4" || /supervisor|falar com/i.test(t)) {
      return doTransfer(
        "supervisor_operacional",
        "Certo! Vou te encaminhar para um supervisor operacional.",
      );
    }
    const opLabel: Record<string, string> = {
      "1": "o registro da sua ocorrência",
      "2": "a solicitação de apoio operacional",
      "3": "o acompanhamento da sua solicitação",
    };
    const registrarOperacional = async (reason: string, necessidade: string) => {
      const cliente = conv?.clienteId ? await repo.getCliente(conv.clienteId) : null;
      await repo.createTransferTicket({
        conversationId,
        clienteId: conv?.clienteId,
        reason,
        priority: "normal",
        dossie: buildDossie({
          cliente: cliente ?? undefined,
          necessidade,
          historicoResumo: allUserText.slice(0, 400),
        }),
      });
    };
    if (opLabel[t]) {
      await registrarOperacional(`operacional:${t}`, opLabel[t]);
      return {
        reply: `Perfeito! Registrei ${opLabel[t]} e encaminhei ao setor operacional. Em breve entram em contato. 😊`,
        toolCalls,
      };
    }
    // Texto livre no menu operacional → trata como descrição da demanda.
    if (t.length > 3) {
      await registrarOperacional("operacional:descricao", lastRaw.slice(0, 300));
      return {
        reply: `Anotado! Encaminhei sua solicitação ao setor operacional responsável. ${CLOSING}`,
        toolCalls,
      };
    }
    return { reply: `Não entendi. Escolha uma opção:\n${STATES.S9.message}`, toolCalls };
  }

  // S10 — setor interno (Funcionário): Departamento Pessoal x Recursos Humanos.
  if (estado === "S10") {
    const t = lastRaw.trim();
    const registrarInterno = async (setor: string, necessidade: string) => {
      const cliente = conv?.clienteId ? await repo.getCliente(conv.clienteId) : null;
      await repo.createTransferTicket({
        conversationId,
        clienteId: conv?.clienteId,
        reason: `interno:${setor}`,
        priority: "normal",
        dossie: buildDossie({
          cliente: cliente ?? undefined,
          necessidade,
          historicoResumo: allUserText.slice(0, 400),
        }),
      });
    };
    if (t === "1" || /departamento pessoal|\bdp\b|folha|f[ée]rias|resc|admiss|benef[íi]cio|atestado/i.test(t)) {
      await registrarInterno("dp", "Departamento Pessoal");
      return {
        reply: `Perfeito! Encaminhei sua solicitação ao Departamento Pessoal. Em breve entram em contato. ${CLOSING}`,
        toolCalls,
      };
    }
    if (t === "2" || /recursos humanos|\brh\b|recrut|vaga|curr[íi]culo|treinamento/i.test(t)) {
      await registrarInterno("rh", "Recursos Humanos");
      return {
        reply: `Perfeito! Encaminhei sua solicitação ao RH. Em breve entram em contato. ${CLOSING}`,
        toolCalls,
      };
    }
    if (t.length > 3) {
      await registrarInterno("descricao", lastRaw.slice(0, 300));
      return {
        reply: `Anotado! Encaminhei sua solicitação ao setor interno responsável. ${CLOSING}`,
        toolCalls,
      };
    }
    return { reply: `Não entendi. Escolha uma opção:\n${STATES.S10.message}`, toolCalls };
  }

  // Fallback defensivo.
  return { reply: STATES.S5.message, toolCalls };
}

// ─── Sub-fluxo de orçamento (estado S5) ───
async function runOrcamento({
  repo,
  call,
  conversationId,
  conv,
  slots,
  lastRaw,
  allUserText,
  toolCalls,
}: {
  repo: ReturnType<typeof getRepository>;
  call: (name: string, input: Record<string, unknown>) => Promise<unknown>;
  conversationId: string;
  conv: Conversation | null;
  slots: LeadSlots;
  lastRaw: string;
  /** Conversa inteira do cliente — a cobertura pode ter sido dita antes do "quantos?". */
  allUserText: string;
  toolCalls: ToolCallTrace[];
}): Promise<AgentRunResult> {
  const existingLead = await repo.getLeadByConversation(conversationId);
  const cliente = conv?.clienteId ? await repo.getCliente(conv.clienteId) : null;

  const name = slots.name ?? existingLead?.contactName ?? cliente?.nome ?? undefined;
  const company = slots.company ?? existingLead?.companyName ?? cliente?.empresa ?? undefined;
  const cnpj = slots.cnpj;

  const service = slots.service ?? existingLead?.servicesInterested?.[0] ?? undefined;

  // Correção explícita de quantidade tem prioridade sobre a extração.
  const corrected = detectNumberCorrection(lastRaw);
  let employees = corrected ?? slots.employees ?? existingLead?.employeesNeeded ?? undefined;
  // Número solto ("2", "dois") como resposta à pergunta "quantos?" quando já há serviço.
  if (!employees && service) {
    const bare = lastRaw.trim();
    const looksBare =
      /^['"´`]?\s*(\d{1,3}|um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|vinte|trinta)\b/i.test(
        bare,
      ) && bare.length <= 20;
    if (looksBare) {
      const n = parseCount(bare);
      if (n) employees = n;
    }
  }

  // Persiste o que reconhecemos (evita repetir a tool sem novidade).
  const leadPatch: Record<string, unknown> = {};
  if (name && name !== existingLead?.contactName) leadPatch.contact_name = name;
  if (company && company !== existingLead?.companyName) leadPatch.company_name = company;
  if (slots.email && slots.email !== existingLead?.email) leadPatch.email = slots.email;
  if (service && !(existingLead?.servicesInterested ?? []).includes(service))
    leadPatch.services_interested = slots.servicesAll ?? [service];
  if (employees && employees !== existingLead?.employeesNeeded) leadPatch.employees_needed = employees;
  if (slots.region && slots.region !== existingLead?.region) leadPatch.region = slots.region;
  if (Object.keys(leadPatch).length) {
    await call("registrar_dados_lead", leadPatch);
  }

  // Faltando serviço ou quantidade → pergunta só o que falta, com exemplo e escape.
  if (!service && !employees) {
    return {
      reply:
        'Ainda não consegui identificar o serviço e a quantidade 😊. Me diz assim, por exemplo: ' +
        '*"2 porteiros na Barra"* ou *"limpeza, 3 postos"*.\n\n' +
        "Serviços: limpeza/ASG, portaria, recepção, zeladoria, jardinagem, piscina e mais. " +
        "Se preferir, digite *consultor* que te passo para uma pessoa.",
      toolCalls,
    };
  }
  if (!service) {
    return { reply: "Qual serviço você procura? (ex.: limpeza/ASG, portaria, recepção, zeladoria, jardinagem)", toolCalls };
  }
  if (!employees) {
    return { reply: `Para ${service}, quantos postos/colaboradores você precisa?`, toolCalls };
  }

  // A REGIÃO ENTRA AQUI. O piso é da CCT da praça, e sem passar a região o motor cota
  // tudo pelo Rio: um cliente de São Paulo ouvia o preço carioca na conversa e depois a
  // proposta era recusada, porque gerar_proposta_pdf já lia a região do lead. A conversa
  // e o PDF precisam olhar para a mesma praça.
  const region = slots.region ?? existingLead?.region ?? undefined;
  // A COBERTURA ENTRA AQUI, pelo mesmo motivo da região: o cliente que pede "1 posto 24h"
  // está pedindo quatro porteiros na 12x36, dois com adicional noturno. Cotar isso como
  // uma pessoa sairia por um quarto da mão de obra.
  const cobertura = detectarCobertura(allUserText) ?? undefined;
  const price = (await call("calcular_preco_servico", {
    service_name: service,
    employees_count: employees,
    ...(region ? { region } : {}),
    ...(cobertura ? { cobertura } : {}),
  })) as {
    unitSalePrice: number; totalSalePrice: number; schedule: string; sobConsulta: boolean;
    regiao?: string; cctCadastrada?: boolean; dimensionamento?: string;
  };
  // Como o posto foi dimensionado, para o cliente ler o mesmo que está no PDF.
  const posto = price.dimensionamento ? ` (${price.dimensionamento})` : "";

  await repo.upsertLead(conversationId, {
    stage: "orcado",
    employeesNeeded: employees,
    servicesInterested: slots.servicesAll ?? [service],
    estimatedValue: price.sobConsulta ? undefined : price.totalSalePrice,
  });

  if (price.sobConsulta) {
    // Dois motivos diferentes, e o cliente merece a resposta certa: praça fora da nossa
    // convenção cadastrada, ou função que a CCT do Rio não cobre. Dizer "sob consulta
    // conforme o escopo" para quem é de São Paulo soa evasivo — o motivo é o piso de lá.
    const foraDaPraca = price.cctCadastrada === false && price.regiao;
    return {
      reply:
        `Anotei: ${employees} posto(s) de ${service}${company ? ` para ${company}` : ""}. ` +
        (foraDaPraca
          ? `Atendemos ${price.regiao} sim — só que o piso salarial de lá vem da convenção coletiva local, então quem fecha o valor é um consultor, para não te passar número do Rio. `
          : "Essa função é orçada sob consulta conforme o escopo — um consultor confirma o valor exato rapidinho e já prepara a proposta formal. ") +
        "Se quiser adiantar, me passa a cidade, a escala e quando pretende iniciar.",
      toolCalls,
    };
  }

  const faltam: string[] = [];
  if (!name) faltam.push("seu nome");
  if (!company) faltam.push("a empresa");
  if (!cnpj) faltam.push("o CNPJ");

  if (faltam.length === 0) {
    await call("gerar_proposta_pdf", {
      lead_data: { contact_name: name, company_name: company, cnpj, email: slots.email },
      services: [
        { name: service, quantity: employees, unit_price: price.unitSalePrice, schedule: price.schedule, ...(cobertura ? { cobertura } : {}) },
      ],
      total_value: price.totalSalePrice,
    });
    return {
      reply:
        `Gerei a proposta formal${company ? ` para ${company}` : ""}: ${employees} posto(s) de ${service}${posto} = ` +
        `${brl(price.totalSalePrice)}/mês. Já te envio o PDF (validade de 24h). Posso ajudar em mais alguma coisa?`,
      toolCalls,
    };
  }

  return {
    reply:
      `Para ${employees} posto(s) de ${service}${posto}, o investimento estimado é de ${brl(price.totalSalePrice)}/mês ` +
      `(${brl(price.unitSalePrice)} por posto). Para eu emitir a proposta formal em PDF, me confirma ${listaPt(faltam)}?`,
    toolCalls,
  };
}
