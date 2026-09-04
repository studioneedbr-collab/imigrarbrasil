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

// ─────────────────────────────────────────────────────────────────────────────
// A CONTA DONA
//
// Todo admin já tem acesso total. O que não existia era a garantia de que SEMPRE reste
// alguém com esse acesso — e neste projeto o caminho para perder isso não é hipotético: a
// tela de usuários só cria e lista, então toda edição de conta até hoje foi feita à mão no
// SQL Editor do Supabase. Um `active = false` na linha errada deixa o painel sem ninguém
// que administre, e a saída seria outro UPDATE no banco, que é o gesto que causou o
// problema.
//
// A GARANTIA DE VERDADE É O TRIGGER (migration 030), porque ela precisa valer no lugar
// onde o estrago acontece, e o SQL Editor não passa por rota nenhuma. O que está aqui é a
// mesma regra em TypeScript, para que a tela recuse antes de tentar e explique por quê —
// erro de banco vazando para a interface é uma frase em inglês sobre trigger.

/** O que se está tentando mudar numa conta. */
export interface MudancaDeConta {
  papel?: Papel;
  ativo?: boolean;
  apagar?: boolean;
}

/**
 * Por que esta mudança não pode acontecer — ou `null` quando pode.
 *
 * Só a conta dona é intocável, e só em três eixos: apagar, desativar e rebaixar. Nome,
 * senha, e-mail e setor mudam normalmente. Proteger a conta não é congelá-la; é garantir
 * que ela continue conseguindo entrar e administrar.
 */
export function porqueNaoPodeMexer(
  alvo: { dono?: boolean },
  mudanca: MudancaDeConta,
): string | null {
  if (!alvo.dono) return null;
  if (mudanca.apagar) {
    return "Esta é a conta dona do painel e não pode ser apagada. Passe a titularidade para outra conta administradora antes.";
  }
  if (mudanca.ativo === false) {
    return "Esta é a conta dona do painel e não pode ser desativada. Passe a titularidade para outra conta administradora antes.";
  }
  if (mudanca.papel && mudanca.papel !== "admin") {
    return "Esta é a conta dona do painel e não pode deixar de ser administradora. Passe a titularidade para outra conta administradora antes.";
  }
  return null;
}

/** A conta dona, se houver. No máximo uma — o índice único do banco garante. */
export function contaDona<T extends { dono?: boolean }>(usuarios: T[]): T | null {
  return usuarios.find((u) => u.dono) ?? null;
}
