import { env, useDeepseek } from "@/lib/env";
import { NOME_DO_IDIOMA } from "@/lib/agent/idioma";
import type { Conversation, Message } from "@/lib/domain/types";
import { registrarChamada, tokensDe, type UsoDeTokens } from "@/lib/custos/registro";

// Follow-up gerado pelo DeepSeek com o CONTEXTO da conversa — nunca genérico.
// Retoma exatamente de onde parou (serviço/assunto + nome, quando houver).
const FOLLOWUP_SYSTEM = `Você é a Ana, do atendimento da Imigrar Brasil (assessoria jurídica em imigração para o Brasil). A pessoa parou de responder.
Baseado no histórico, gere UMA mensagem curta e natural de retomada, ESCRITA NO MESMO IDIOMA que a pessoa usou na conversa.
NÃO seja genérica: retome o assunto específico que estava sendo tratado e, se souber, use o nome dela.
Tom acolhedor, nunca cobrando resposta e nunca pressionando — muita gente aqui está em situação delicada e sumiu por medo, não por desinteresse.
NUNCA prometa resultado, prazo, valor ou aprovação, e nunca afirme requisito ou documento.
Máximo 2 frases, tom de WhatsApp natural, no máximo 1 emoji (e emoji nenhum se o assunto for sensível). Nunca use travessão (—) nem listas.
Responda SÓ com a mensagem, nada mais.`;

// Usado quando o DeepSeek não está disponível ou falha — nunca deixa a pessoa sem retomada.
//
// Antes era uma constante PT/ES: quem tinha conversado inteiro em inglês, francês ou
// crioulo recebia a retomada automática em duas línguas que não eram a dele. Agora o
// idioma gravado no contato (conversations.idioma) escolhe o texto, e o par PT/ES fica
// só como padrão de quando não se sabe.
const FALLBACK_POR_IDIOMA: Record<string, string> = {
  pt: "Oi! Ficou alguma dúvida sobre o que a gente conversou? Estou por aqui se precisar.",
  es: "¡Hola! ¿Quedó alguna duda sobre lo que hablamos? Estoy por aquí si necesitas.",
  en: "Hi! Any questions about what we talked about? I'm here if you need anything.",
  fr: "Bonjour ! Est-ce qu'il vous reste des questions sur ce dont nous avons parlé ? Je reste disponible.",
  ht: "Bonjou! Ou gen kesyon sou sa nou te pale a? Mwen la si ou bezwen.",
};

const FALLBACK_PADRAO = `${FALLBACK_POR_IDIOMA.pt}\n${FALLBACK_POR_IDIOMA.es}`;

export function followupFallback(idioma?: string | null): string {
  if (!idioma) return FALLBACK_PADRAO;
  return FALLBACK_POR_IDIOMA[idioma] ?? FALLBACK_PADRAO;
}

export async function generateFollowupMessage(
  conversation: Conversation,
  messages: Message[],
): Promise<string> {
  const FALLBACK = followupFallback(conversation.idioma);
  if (!useDeepseek) return FALLBACK;

  const nome = conversation.contactName ? `Nome do lead: ${conversation.contactName}.` : "";
  // O idioma gravado é mais confiável do que o modelo reinferir pelo histórico: as últimas
  // mensagens podem ser "ok" e "obrigado", que não dizem nada sobre a língua da conversa.
  const idioma = conversation.idioma
    ? `\nESCREVA EM ${(NOME_DO_IDIOMA[conversation.idioma] ?? conversation.idioma).toUpperCase()} — é o idioma desta pessoa, registrado no atendimento.`
    : "";
  const history = messages
    .slice(-12)
    .map((m) => `${m.role === "user" ? "Pessoa" : "Ana"}: ${m.content}`)
    .join("\n");

  const inicio = Date.now();
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
          { role: "system", content: `${FOLLOWUP_SYSTEM}\n${nome}${idioma}` },
          { role: "user", content: `Histórico da conversa:\n${history}\n\nGere a mensagem de follow-up.` },
        ],
        max_tokens: 160,
        temperature: 0.5,
      }),
    });
    if (!res.ok) {
      await registrarChamada({
        provedor: "deepseek", modelo: env.deepseekModel, tipo: "redacao",
        conversationId: conversation.id, duracaoMs: Date.now() - inicio,
        ok: false, erro: `HTTP ${res.status}`,
      });
      return FALLBACK;
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: UsoDeTokens;
    };
    const { entrada, saida } = tokensDe(data.usage);
    // O follow-up é escrito sem ninguém por perto, uma vez por conversa parada. É barato
    // por chamada e some da conta se não for medido — e é exatamente esse tipo de gasto
    // que vira surpresa no fim do mês.
    await registrarChamada({
      provedor: "deepseek", modelo: env.deepseekModel, tipo: "redacao",
      conversationId: conversation.id, tokensEntrada: entrada, tokensSaida: saida,
      duracaoMs: Date.now() - inicio, ok: true,
    });
    return (data.choices?.[0]?.message?.content ?? "").trim() || FALLBACK;
  } catch (err) {
    await registrarChamada({
      provedor: "deepseek", modelo: env.deepseekModel, tipo: "redacao",
      conversationId: conversation.id, duracaoMs: Date.now() - inicio,
      ok: false, erro: err instanceof Error ? err.message : "rede",
    });
    return FALLBACK;
  }
}
