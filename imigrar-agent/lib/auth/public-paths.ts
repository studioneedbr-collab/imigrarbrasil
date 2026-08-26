// Allowlist de rotas que respondem sem sessão. Mantida em módulo separado
// para ser testável isoladamente — o middleware não é fácil de exercitar em teste.
//
// Cada entrada precisa justificar por que pode ficar aberta:
//  /api/auth/login   — é o próprio mecanismo de entrada (tem rate limit próprio)
//  /api/auth/logout  — limpar cookie não expõe nada
//  /api/auth/setup   — criação do 1º admin; ele mesmo se tranca depois (403)
//  /api/webhook/whatsapp — autenticado no próprio handler (token na URL ?token= ou Client-Token)
//  /api/health       — diagnóstico sem segredos (modo do repositório + flags de integração)
//  /api/cron/*        — autenticados por CRON_SECRET (Bearer/query) no próprio handler
//
// SAIU DAQUI: `/api/proposal/<uuid>`, que servia o PDF da proposta comercial por link
// compartilhável. Além de a tela de propostas não existir mais, "UUID não adivinhável"
// não é controle de acesso aceitável para o que este sistema guarda — situação
// migratória de gente em situação irregular. Nenhuma rota deste painel responde sem
// sessão.
const PUBLIC_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/setup",
  "/api/webhook/whatsapp",
  "/api/health",
  "/api/cron/followups",
  "/api/cron/followup",
]);

/**
 * Correspondência EXATA, nunca por prefixo: `startsWith("/api/auth")` deixaria
 * `/api/auth/qualquer-coisa-nova` aberta por acidente no futuro.
 */
export function isPublicPath(pathname: string): boolean {
  const normalized = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  return PUBLIC_PATHS.has(normalized);
}

export const PUBLIC_PATHS_LIST = Array.from(PUBLIC_PATHS);
