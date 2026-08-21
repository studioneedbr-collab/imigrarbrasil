import { TRANSFER_RULES } from "@/lib/agent/knowledge";
import { buildTransferRegex, type TransferRuleConfig } from "@/lib/agent/training";
import type { Cliente, Lead, TransferDossie } from "@/lib/domain/types";

/**
 * `rules` são as regras editadas em /dashboard/treinar. Sem elas vale a lista do código —
 * é o que mantém o comportamento de quem nunca abriu o painel exatamente como era, e o
 * que faz os testes de regex continuarem valendo.
 */
export function detectTransfer(
  text: string,
  rules?: TransferRuleConfig[],
): { categoria: string; resposta: string } | undefined {
  if (rules) {
    for (const r of rules) {
      if (!r.ativo) continue;
      const re = buildTransferRegex(r.keywords);
      if (re?.test(text)) return { categoria: r.categoria, resposta: r.resposta };
    }
    return undefined;
  }
  const rule = TRANSFER_RULES.find((r) => r.regex.test(text));
  return rule ? { categoria: rule.categoria, resposta: rule.resposta } : undefined;
}

export function buildDossie(input: {
  cliente?: Partial<Cliente>; lead?: Partial<Lead>; necessidade?: string; historicoResumo?: string;
}): TransferDossie {
  return {
    nome: input.cliente?.nome, empresa: input.cliente?.empresa, cpf: input.cliente?.cpf,
    cidade: input.cliente?.cidade ?? input.lead?.region ?? undefined,
    servicos: input.lead?.servicesInterested ?? undefined, quantidade: input.lead?.employeesNeeded ?? undefined,
    escala: input.lead?.schedule, necessidade: input.necessidade,
    historicoResumo: input.historicoResumo,
  };
}
