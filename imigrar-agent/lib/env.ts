const isProd = () => process.env.NODE_ENV === "production";

/**
 * Segredo com default só de desenvolvimento. Em produção, cair no default é
 * tratado como ausência de configuração — o chamador decide como falhar.
 */
function devOnlyDefault(value: string, devFallback: string): string {
  if (value) return value;
  return isProd() ? "" : devFallback;
}

export const env = {
  // DeepSeek (OpenAI-compatible) — ÚNICO provedor de LLM do agente.
  deepseekKey: process.env.DEEPSEEK_API_KEY ?? "",
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
  deepseekModel: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  whatsappToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
  phoneNumberId: process.env.PHONE_NUMBER_ID ?? "",
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET ?? "",
  // Z-API (gateway de WhatsApp) — provedor ativo de envio/recebimento.
  zapiInstanceId: process.env.ZAPI_INSTANCE_ID ?? "",
  zapiToken: process.env.ZAPI_TOKEN ?? "",
  zapiClientToken: process.env.ZAPI_CLIENT_TOKEN ?? "",
  // WhatsApp da equipe que recebe os leads quentes transferidos (só dígitos, ex.: 552135400693).
  teamWhatsapp: process.env.TEAM_WHATSAPP ?? "",
  // WhatsApp do dono/gestor que recebe um aviso a CADA proposta enviada (controle interno).
  // Brevo (envio de e-mail das propostas) — fallback do que for salvo no painel.
  brevoApiKey: process.env.BREVO_API_KEY ?? "",
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL ?? "",
  brevoSenderName: process.env.BREVO_SENDER_NAME ?? "Imigrar Brasil",
  // E-mail que recebe currículos/documentos de candidato encaminhados pelo webhook.
  rhEmail: process.env.RH_EMAIL ?? "",
  // OpenAI — NÃO é o provedor do agente (isso é o DeepSeek). Serve a duas coisas que o
  // DeepSeek não faz: o embedding da consulta ao RAG e a transcrição de áudio.
  openaiKey: process.env.OPENAI_API_KEY ?? "",
  // Segredo do cron de follow-up (Vercel manda como Authorization: Bearer; cron externo usa ?secret=).
  cronSecret: process.env.CRON_SECRET ?? "",
  // Em produção fica vazio se não configurado — e o webhook rejeita tudo (fail-closed),
  // em vez de aceitar um token público conhecido.
  webhookVerifyToken: devOnlyDefault(process.env.WEBHOOK_VERIFY_TOKEN ?? "", "imigrar_webhook_dev"),
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

// AUTH_SECRET não é exposto aqui de propósito: quem precisa dele é lib/auth/session.ts,
// que o valida e falha alto em produção. ADMIN_EMAIL/ADMIN_PASSWORD foram REMOVIDOS —
// credencial de usuário não mora em variável de ambiente; o 1º admin é criado
// pelo fluxo de /setup, que se tranca sozinho depois (lib/auth/bootstrap.ts).

/**
 * Embeddings da BUSCA na base jurídica. As variáveis são deliberadamente as MESMAS do
 * `ingestao/embed_upsert.py`, com os mesmos defaults: o vetor da consulta precisa sair do
 * mesmo modelo e da mesma dimensão que indexaram os chunks, e divergir aqui não dá erro —
 * dá recuperação silenciosamente ruim, que é muito pior de descobrir.
 */
export const embeddingsConfig = {
  provider: (process.env.EMBEDDINGS_PROVIDER ?? "openai") as "openai" | "tei",
  model: process.env.EMBEDDINGS_MODEL ?? "text-embedding-3-large",
  dim: Number(process.env.EMBEDDINGS_DIM ?? "1024"),
  /** provider=tei — endpoint do Text Embeddings Inference (BGE-M3). */
  url: process.env.EMBEDDINGS_URL ?? "",
  openaiKey: process.env.OPENAI_API_KEY ?? "",
};

export const useSupabase = Boolean(env.supabaseUrl && env.supabaseServiceKey);
export const useDeepseek = Boolean(env.deepseekKey);
// O agente "conduz" (LLM real com tools) quando o DeepSeek está configurado; senão
// roda o engine determinístico. Não há outro provedor.
export const useSmartAgent = useDeepseek;
export const whatsappConfigured = Boolean(env.whatsappToken && env.phoneNumberId);
// WhatsApp via Z-API: exige instância + token. O Client-Token é opcional conforme a conta.
export const zapiConfigured = Boolean(env.zapiInstanceId && env.zapiToken);
