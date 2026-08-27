import { getZapiConfig, type ZapiResolvedConfig } from "./config";

// POR ONDE ESTA MENSAGEM SAI.
//
// Todo envio aceita uma configuração explícita. Com mais de uma instância Z-API
// cadastrada, "a config do sistema" deixou de ser uma resposta: a mensagem tem de sair
// pelo mesmo número por onde a conversa entrou. Sem o parâmetro, cai na config única de
// sempre — que continua correta para quem tem uma instância só.
type Canal = ZapiResolvedConfig | undefined;
const resolverCanal = async (canal: Canal): Promise<ZapiResolvedConfig> => canal ?? (await getZapiConfig());

// Envio via Z-API. Endpoint base: {baseUrl}/instances/{id}/token/{token}/...
// As credenciais vêm de getZapiConfig() (painel → banco, com ENV de fallback).
const zapiUrl = (cfg: ZapiResolvedConfig, path: string) =>
  `${cfg.baseUrl}/instances/${cfg.instanceId}/token/${cfg.token}/${path}`;

function zapiHeaders(clientToken: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  // O header Client-Token é exigido pela Z-API quando a conta tem token de segurança.
  if (clientToken) h["Client-Token"] = clientToken;
  return h;
}

// Z-API espera o telefone em dígitos (DDI+DDD+número, ex.: 5521999999999).
function normalizePhone(to: string): string {
  return (to || "").replace(/\D/g, "");
}

// O WhatsApp usa *UM* asterisco para negrito; o LLM emite markdown com ** (dois).
// Sem isto, o cliente vê os "**" literais. Converte ** → * e remove ### de títulos.
function toWhatsappFormat(text: string): string {
  return (text || "")
    .replace(/\*\*(.+?)\*\*/g, "*$1*") // **negrito** → *negrito*
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // remove "### Título" de markdown
    .replace(/^\s{0,3}[-*]\s+/gm, "• ") // itens de lista "- x" / "* x" → "• x"
    .replace(/\s+[—–]\s+/g, ", ") // travessão espaçado " — " vira ", " (cara de IA)
    .replace(/[—–]/g, "-"); // qualquer travessão/en-dash restante vira hífen simples
}

export async function sendMessage(to: string, text: string, canal?: Canal): Promise<void> {
  const cfg = await resolverCanal(canal);
  if (!cfg.configured) {
    // Em dev mostra a mensagem inteira; em produção só o tamanho — o texto
    // contém dados do cliente e não deve ir para os logs (LGPD).
    console.log(
      process.env.NODE_ENV === "production"
        ? `[whatsapp:sim] -> ${to}: (${text.length} caracteres)`
        : `[whatsapp:sim] -> ${to}: ${text}`,
    );
    return;
  }
  // delayMessage: a Z-API mostra "digitando…" por N segundos antes de enviar —
  // dá um ritmo humano. Escala com o tamanho do texto (1–5s).
  const message = toWhatsappFormat(text);
  const delayMessage = Math.min(5, Math.max(1, Math.round(message.length / 90)));
  const res = await fetch(zapiUrl(cfg, "send-text"), {
    method: "POST",
    headers: zapiHeaders(cfg.clientToken),
    body: JSON.stringify({ phone: normalizePhone(to), message, delayMessage }),
  });
  if (!res.ok) throw new Error(`Z-API send-text failed: ${res.status} ${await res.text()}`);
}

// Envia uma pergunta com botões de resposta rápida (máx 3). Se a Z-API/WhatsApp não
// renderizar os botões, cai para uma lista numerada em texto (sempre funciona).
export async function sendButtons(
  to: string,
  message: string,
  buttons: { id: string; label: string }[],
  canal?: Canal,
): Promise<void> {
  const cfg = await resolverCanal(canal);
  const opts = buttons.slice(0, 3);
  const msg = toWhatsappFormat(message);
  if (!cfg.configured) {
    console.log(`[whatsapp:sim] -> ${to}: [botões] ${msg} | ${opts.map((b) => b.label).join(" / ")}`);
    return;
  }
  try {
    const res = await fetch(zapiUrl(cfg, "send-button-list"), {
      method: "POST",
      headers: zapiHeaders(cfg.clientToken),
      body: JSON.stringify({ phone: normalizePhone(to), message: msg, buttonList: { buttons: opts } }),
    });
    if (res.ok) return;
    console.error("[whatsapp] send-button-list falhou, fallback texto:", res.status);
  } catch (e) {
    console.error("[whatsapp] send-button-list erro, fallback texto:", e instanceof Error ? e.message : e);
  }
  // Fallback: lista numerada em texto.
  await sendMessage(to, `${message}\n\n${opts.map((b, i) => `${i + 1}. ${b.label}`).join("\n")}`, canal);
}

export async function sendDocument(to: string, link: string, filename: string, canal?: Canal): Promise<void> {
  const cfg = await resolverCanal(canal);
  if (!cfg.configured) {
    console.log(`[whatsapp:sim] -> ${to}: [doc] ${filename}`);
    return;
  }
  // Z-API envia documento por URL em /send-document/{extensão}. Deriva a extensão do
  // nome do arquivo (padrão pdf) — é o formato real da API (não existe /send-document/url).
  const ext = (filename.split(".").pop() || "pdf").toLowerCase();
  const res = await fetch(zapiUrl(cfg, `send-document/${ext}`), {
    method: "POST",
    headers: zapiHeaders(cfg.clientToken),
    body: JSON.stringify({ phone: normalizePhone(to), document: link, fileName: filename }),
  });
  if (!res.ok) throw new Error(`Z-API send-document failed: ${res.status} ${await res.text()}`);
}
