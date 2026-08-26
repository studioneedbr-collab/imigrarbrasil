// OS PAPÉIS DESTE PAINEL.
//
// Aqui não se guarda cadastro de cliente: guarda-se situação migratória de gente em
// situação irregular e de solicitante de refúgio. É dado pessoal sensível sob a LGPD e,
// em alguns casos, informação que exposta causa dano real à pessoa — uma planilha
// exportada e esquecida num Drive compartilhado não é um vazamento abstrato.
//
//   advogado     acesso total: fila, detalhe, métricas e exportação
//   atendente    fila e detalhe. NÃO exporta.
//   administrador  além do acesso do advogado: usuários, retenção e log de acesso
//
// O papel 'user', da base que originou este código, continua sendo aceito e é lido como
// ATENDENTE — o mais restrito dos três. Migration nenhuma promove ninguém: uma conta que
// ganhasse permissão de exportar por efeito colateral de um deploy seria exatamente o
// tipo de acesso que este arquivo existe para impedir.

export type Papel = "admin" | "advogado" | "atendente";

export const PAPEIS: Papel[] = ["admin", "advogado", "atendente"];

export const PAPEL_LABEL: Record<Papel, string> = {
  admin: "Administrador",
  advogado: "Advogado",
  atendente: "Atendente",
};

export const PAPEL_DESCRICAO: Record<Papel, string> = {
  admin: "Acesso total, mais usuários, retenção e log de acesso.",
  advogado: "Fila, detalhe, métricas e exportação.",
  atendente: "Fila e detalhe. Não exporta.",
};

export function normalizarPapel(raw: unknown): Papel {
  if (raw === "admin") return "admin";
  if (raw === "advogado") return "advogado";
  // 'atendente', 'user' e qualquer coisa desconhecida caem no papel mais restrito.
  return "atendente";
}

/** Exportar é tirar dado sensível de dentro do painel. Só advogado e administrador. */
export function podeExportar(papel: Papel): boolean {
  return papel === "advogado" || papel === "admin";
}

/** Usuários, política de retenção e log de acesso. */
export function podeAdministrar(papel: Papel): boolean {
  return papel === "admin";
}
