import { env, useDeepseek } from "@/lib/env";
import type { Conversation, Message } from "@/lib/domain/types";

// Follow-up gerado pelo DeepSeek com o CONTEXTO da conversa — nunca genérico.
// Retoma exatamente de onde parou (serviço/assunto + nome, quando houver).
const FOLLOWUP_SYSTEM = `Você é a Shayene, da Shine Rio. O lead parou de responder.
Baseado no histórico, gere UMA mensagem curta e natural de follow-up que retome exatamente de onde a conversa parou.
NÃO seja genérica: mencione o serviço/assunto específico que estava sendo tratado e, se souber, o nome da pessoa.
Máximo 2 frases, tom de WhatsApp natural, no máximo 1 emoji. Nunca use travessão (—) nem listas.
Responda SÓ com a mensagem de follow-up, nada mais.`;

// Usado quando o DeepSeek não está disponível ou falha — nunca deixa o lead sem retomada.
const FALLBACK =
  "Oi! Ficou alguma dúvida sobre o que a gente conversou? 😊 Consigo te ajudar a seguir daqui, é só me chamar!";

export async function generateFollowupMessage(
  conversation: Conversation,
  messages: Message[],
): Promise<string> {
  if (!useDeepseek) return FALLBACK;

  const nome = conversation.contactName ? `Nome do lead: ${conversation.contactName}.` : "";
  const history = messages
    .slice(-12)
    .map((m) => `${m.role === "user" ? "Cliente" : "Shayene"}: ${m.content}`)
    .join("\n");

  try {
    const res = await fetch(`${env.deepseekBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.deepseekKey}`,
      },
      body: JSON.stringify({
        model: env.deepseekModel,
        messages: [
          { role: "system", content: `${FOLLOWUP_SYSTEM}\n${nome}` },
          { role: "user", content: `Histórico da conversa:\n${history}\n\nGere a mensagem de follow-up.` },
        ],
        max_tokens: 160,
        temperature: 0.5,
      }),
    });
    if (!res.ok) return FALLBACK;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return (data.choices?.[0]?.message?.content ?? "").trim() || FALLBACK;
  } catch {
    return FALLBACK;
  }
}
