export interface ProposalEmailInput {
  toEmail: string; clienteNome?: string; empresa?: string;
  totalValue: number; viewUrl: string;
}
export interface ProposalEmail { subject: string; body: string; mailto: string; }

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function buildProposalEmail(i: ProposalEmailInput): ProposalEmail {
  const subject = `Proposta comercial Shine Rio — ${i.empresa ?? i.clienteNome ?? "sua empresa"}`;
  const body =
    `Olá${i.clienteNome ? `, ${i.clienteNome}` : ""}!\n\n` +
    `Segue a proposta comercial da Shine Rio, referente ao serviço solicitado.\n` +
    `Valor mensal estimado: ${brl(i.totalValue)}.\n\n` +
    `Você pode visualizar a proposta completa neste link:\n${i.viewUrl}\n\n` +
    `A Shine Rio tem 13 anos de mercado, 378 colaboradores ativos e gestão com compliance ` +
    `trabalhista — cuidamos de toda a parte administrativa enquanto você mantém o controle dos resultados.\n\n` +
    `Qualquer dúvida, estou à disposição.\nEquipe Comercial — Shine Rio\n(21) 3540-0693`;
  const mailto =
    `mailto:${i.toEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { subject, body, mailto };
}
