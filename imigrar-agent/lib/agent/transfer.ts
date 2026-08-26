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
  // `buildTransferRegex` já é insensível a acento nos dois sentidos — a regra vem do
  // painel escrita com acento e a mensagem chega do WhatsApp quase sempre sem.
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

/**
 * O RESUMO QUE O ADVOGADO LÊ PRIMEIRO, quando um chamado é aberto pelo painel.
 *
 * Os campos são os da estrutura herdada, com a leitura deste domínio: `cidade` é onde a
 * pessoa está agora, `servicos` é o caminho migratório que ela procura e `necessidade` é
 * o que ela pediu. Quantidade de postos e escala de trabalho saíram — eram da base de
 * terceirização e não significam nada num caso de imigração.
 */
export function buildDossie(input: {
  cliente?: Partial<Cliente>; lead?: Partial<Lead>; necessidade?: string; historicoResumo?: string;
}): TransferDossie {
  return {
    nome: input.cliente?.nome ?? input.lead?.contactName ?? undefined,
    empresa: input.cliente?.empresa ?? input.lead?.companyName ?? undefined,
    cidade: input.cliente?.cidade ?? input.lead?.region ?? undefined,
    servicos: input.lead?.servicesInterested ?? undefined,
    necessidade: input.necessidade,
    historicoResumo: input.historicoResumo,
  };
}
