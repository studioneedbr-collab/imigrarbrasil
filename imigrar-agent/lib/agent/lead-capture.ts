// O DOSSIÊ SE PREENCHE SOZINHO.
//
// Antes, o painel só mostrava dados do lead quando o modelo lembrava de chamar
// registrar_dados_lead. Quando ele não chamava — e ele esquece com frequência —, a
// conversa inteira acontecia, o cliente dizia "4 porteiros e 5 auxiliares de limpeza",
// e o dossiê continuava em "Coletando…" com o score subindo sozinho. Quem abria o
// painel não tinha nada na mão.
//
// Aqui a leitura é determinística e roda a TODO turno, em cima do que o cliente
// escreveu. Nunca sobrescreve o que já está gravado (o que veio da tool ou da mão de
// um atendente vale mais que a heurística): só preenche buraco.

import { extractSlots } from "@/lib/agent/qualification";
import type { Lead } from "@/lib/domain/types";

/** Campos que a triagem comercial precisa ter ANTES de a proposta sair. */
export interface DossieFaltando {
  /** Rótulos legíveis do que ainda SEGURA o PDF, na ordem em que vale a pena perguntar. */
  faltam: string[];
  /** Nada essencial falta — dá para gerar a proposta AGORA. */
  completo: boolean;
  /** Dados que o comercial quer ter, mas que NÃO seguram a proposta. Pergunte depois do PDF. */
  complementares: string[];
}

const CNPJ_RE = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/;

/** O lead já tem um CNPJ (ou CPF) registrado em algum lugar? */
export function temDocumento(lead: Pick<Lead, "notes" | "companyName" | "contactName"> | null): boolean {
  if (!lead) return false;
  const hay = `${lead.notes ?? ""} ${lead.companyName ?? ""} ${lead.contactName ?? ""}`;
  return CNPJ_RE.test(hay) || /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(hay);
}

/**
 * A triagem mínima de um lead comercial — o que SEGURA o PDF e o que não segura.
 *
 * A lista essencial encolheu em 17/08/2026, por decisão do Eduardo. Antes eram sete campos
 * (serviço, postos, região, nome, empresa, CNPJ e e-mail) e a proposta só saía com todos:
 * na prática a Shayene ficava em loop pedindo CNPJ de um cliente que só queria ver o preço,
 * e o PDF — a única coisa que faz a venda andar — nunca chegava.
 *
 * O que a proposta REALMENTE precisa é do que o motor usa para calcular (serviço, quantos
 * postos, a praça da CCT) mais o nome da empresa, que é o cabeçalho do documento. Nome do
 * contato, e-mail e CNPJ continuam valendo — só não seguram mais o envio: a Shayene pede
 * DEPOIS do PDF, com o cliente já com o valor na mão. CNPJ só é obrigatório se ele pedir
 * nota fiscal.
 */
export function dossieComercialFaltando(lead: Lead | null): DossieFaltando {
  const faltam = [
    !lead?.servicesInterested?.length && "qual serviço",
    !lead?.employeesNeeded && "quantos postos",
    !lead?.region && "a cidade/região do serviço",
    !lead?.companyName && "o nome da empresa",
  ].filter((x): x is string => typeof x === "string");
  const complementares = [
    !lead?.contactName && "o seu nome",
    !lead?.email && "o e-mail para enviar a proposta",
    !temDocumento(lead) && "o CNPJ (só se ele pedir nota fiscal)",
  ].filter((x): x is string => typeof x === "string");
  return { faltam, completo: faltam.length === 0, complementares };
}

/**
 * A QUALIFICAÇÃO DA IMIGRAR BRASIL — o que o advogado precisa ter na mão quando pegar
 * esta conversa: nacionalidade, onde a pessoa está, o que ela quer conseguir e se há prazo.
 *
 * Usa os mesmos campos do lead, com a leitura deste domínio: `clientType` guarda a
 * nacionalidade, `region` onde a pessoa está agora e `servicesInterested` o que ela
 * procura. Nada aqui SEGURA nada: diferente da triagem comercial, um caso concreto vai
 * para o time jurídico mesmo com a lista pela metade.
 */
export function qualificacaoFaltando(lead: Lead | null): DossieFaltando {
  const faltam = [
    !lead?.clientType && "a nacionalidade",
    !lead?.region && "onde a pessoa está agora (no Brasil ou no exterior)",
    !lead?.servicesInterested?.length && "o que ela quer conseguir",
    !lead?.urgency && "se há prazo ou urgência",
  ].filter((x): x is string => typeof x === "string");
  const complementares = [!lead?.contactName && "o nome dela"].filter(
    (x): x is string => typeof x === "string",
  );
  return { faltam, completo: faltam.length === 0, complementares };
}

/**
 * Lê o que o cliente escreveu e devolve o patch do que AINDA NÃO está no lead.
 * Devolve `null` quando não há novidade — assim o chamador não escreve à toa.
 */
export function capturarDadosDoLead(
  textoDoCliente: string,
  lead: Lead | null,
): Partial<Lead> | null {
  const slots = extractSlots(textoDoCliente);
  const patch: Partial<Lead> = {};

  if (slots.name && !lead?.contactName) patch.contactName = slots.name;
  if (slots.company && !lead?.companyName) patch.companyName = slots.company;
  if (slots.email && !lead?.email) patch.email = slots.email;
  if (slots.region && !lead?.region) patch.region = slots.region;
  if (slots.urgency && !lead?.urgency) patch.urgency = slots.urgency;
  if (slots.employees && !lead?.employeesNeeded) patch.employeesNeeded = slots.employees;

  // Serviços: acumula em vez de trocar. O cliente que pede "4 porteiros e 5 auxiliares
  // de limpeza" tem DOIS serviços, e sobrescrever com o primeiro apaga metade do pedido.
  if (slots.servicesAll?.length) {
    const atuais = lead?.servicesInterested ?? [];
    const novos = slots.servicesAll.filter((s) => !atuais.includes(s));
    if (novos.length) patch.servicesInterested = [...atuais, ...novos];
  }

  // CNPJ não tem coluna própria no lead — vive em `notes`, que é onde o painel procura
  // o documento para marcar a triagem como completa.
  const cnpj = textoDoCliente.match(CNPJ_RE)?.[0];
  if (cnpj && !CNPJ_RE.test(lead?.notes ?? "")) {
    patch.notes = `${lead?.notes ? `${lead.notes}\n` : ""}CNPJ: ${cnpj}`;
  }

  return Object.keys(patch).length ? patch : null;
}
