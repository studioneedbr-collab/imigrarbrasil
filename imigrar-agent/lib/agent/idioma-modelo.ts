// O IDIOMA QUANDO A HEURÍSTICA NÃO ALCANÇA — a última instância, e só ela.
//
// `lib/agent/idioma.ts` decide por alfabeto e por marcadores escritos à mão. Isso cobre
// bem as línguas que este atendimento mais vê (português, espanhol, inglês, francês,
// crioulo, e o que se reconhece pela escrita), e não cobre NADA além disso: quem escreve
// em alemão, italiano, turco, wolof ou suaíli cai em `undefined`.
//
// O turno em si não sofre com isso — a REGRA ABSOLUTA 1 do prompt manda o modelo
// responder na língua de quem escreveu, e ele responde. Quem sofre é tudo que acontece
// FORA do turno, e que lê o campo `idioma` gravado no contato:
//
//   1. O FOLLOW-UP AUTOMÁTICO, que sai do cron e monta o texto com "ESCREVA EM <idioma>".
//      Sem idioma gravado, a retomada de uma conversa inteira em alemão sai em português.
//   2. O CHIP DE IDIOMA NA FILA, que é como o time sabe, antes de abrir a conversa, se
//      consegue atender aquela pessoa.
//
// POR QUE ISTO É O ÚLTIMO RECURSO, E NÃO O PRIMEIRO. A heurística é grátis, instantânea e
// acerta na esmagadora maioria das conversas. Este módulo custa uma chamada paga. Chamado
// só quando a heurística desistiu E o contato ainda não tem idioma gravado, ele dispara
// no máximo uma ou duas vezes por conversa: assim que devolve um código, ele é gravado, a
// heurística deixa de ser consultada e este caminho nunca mais é percorrido.
//
// A DOUTRINA DE `idioma.ts` VALE AQUI INTEIRA: na dúvida, `undefined`. Um palpite errado
// não é um erro de um turno — ele gruda no contato e passa a mandar todo follow-up na
// língua errada. Por isso a resposta do modelo só é aceita quando vem exatamente como foi
// pedida: duas letras, e nada mais. "parece espanhol" é uma dúvida, não uma resposta.

import { env } from "@/lib/env";
import { registrarChamada, tokensDe, type UsoDeTokens } from "@/lib/custos/registro";
import { idiomaDaConversa } from "@/lib/agent/idioma";

const INSTRUCAO =
  "Você identifica idiomas. Recebe uma mensagem de WhatsApp e responde APENAS o código " +
  "ISO 639-1 de duas letras do idioma em que ela foi escrita (ex.: pt, es, tr, de, sw). " +
  "Se não der para saber com segurança, responda exatamente xx. " +
  "Nunca escreva mais nada: nem o nome do idioma, nem pontuação, nem explicação.";

/**
 * Mesmo mínimo de `detectarIdiomaComModelo`… quer dizer, de `detectarIdioma`: abaixo disto
 * nem o modelo tem o que ler, e a chamada seria paga para devolver "xx".
 */
const MINIMO_DE_TEXTO = 10;

/**
 * O código que o modelo respondeu, ou `undefined`.
 *
 * Exige a resposta EXATA — duas letras, ignorando espaço, aspas e ponto final, que são o
 * enfeite que todo modelo às vezes acrescenta. Qualquer outra coisa é tratada como "não
 * sei": preferir o silêncio a extrair um código de dentro de uma frase, porque "no sé"
 * extrairia "no" e gravaria norueguês no contato de quem escreveu em espanhol.
 */
export function interpretarCodigoDeIdioma(bruto: string | null | undefined): string | undefined {
  const limpo = (bruto ?? "").trim().replace(/^["'`]+|["'`.!]+$/g, "").trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(limpo)) return undefined;
  if (limpo === "xx") return undefined;
  return limpo;
}

/**
 * Pergunta o idioma ao modelo. NUNCA lança: falhar aqui pode custar um follow-up na língua
 * errada, e não pode custar a conversa.
 *
 * O chamador é quem decide se o provedor está disponível (`useDeepseek`) — a checagem não
 * mora aqui para que a suíte consiga exercitar o caminho inteiro.
 */
export async function detectarIdiomaComModelo(
  texto: string,
  conversationId?: string,
): Promise<string | undefined> {
  const t = (texto ?? "").trim();
  if (t.length < MINIMO_DE_TEXTO) return undefined;

  const inicio = Date.now();
  const contabilizar = (uso: UsoDeTokens | undefined, ok: boolean, erro?: string) => {
    const { entrada, saida } = tokensDe(uso);
    void registrarChamada({
      provedor: "deepseek",
      modelo: env.deepseekModel,
      tipo: "classificacao",
      conversationId,
      tokensEntrada: entrada,
      tokensSaida: saida,
      duracaoMs: Date.now() - inicio,
      ok,
      erro,
    });
  };

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
          { role: "system", content: INSTRUCAO },
          // Só o fim do texto: a conversa inteira pode ser longa, e para dizer a língua
          // bastam as últimas frases. Isto é uma chamada paga por conversa, não por token.
          { role: "user", content: t.slice(-600) },
        ],
        max_tokens: 4,
        temperature: 0,
      }),
    });
    if (!res.ok) {
      contabilizar(undefined, false, `HTTP ${res.status}`);
      return undefined;
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: UsoDeTokens;
    };
    const codigo = interpretarCodigoDeIdioma(data.choices?.[0]?.message?.content);
    contabilizar(data.usage, true, codigo ? undefined : "resposta sem código de idioma");
    return codigo;
  } catch (err) {
    contabilizar(undefined, false, err instanceof Error ? err.message : "rede");
    return undefined;
  }
}

/**
 * O IDIOMA DA CONVERSA, com o modelo como última instância.
 *
 * A ordem é a economia inteira desta funcionalidade: a heurística responde de graça e na
 * hora quase sempre, o idioma já gravado responde pelo resto, e só o que sobra — conversa
 * numa língua que a heurística não conhece, contato ainda sem idioma — chega a custar uma
 * chamada. Como o resultado é gravado logo em seguida (`registrarIdioma`), o caminho pago
 * se fecha sozinho depois da primeira vez.
 *
 * `habilitado` é o `useDeepseek` do chamador. Ele entra por parâmetro em vez de ser lido
 * aqui porque `useDeepseek` é constante de import: lida aqui dentro, a suíte jamais
 * conseguiria exercitar o caminho do modelo (em teste ela é sempre falsa, de propósito).
 */
export async function idiomaDaConversaOuModelo(
  ultimaMensagem: string,
  conversaInteira: string,
  gravado?: string | null,
  opts?: { conversationId?: string; habilitado?: boolean },
): Promise<string | undefined> {
  const heuristica = idiomaDaConversa(ultimaMensagem, conversaInteira, gravado);
  if (heuristica || !opts?.habilitado) return heuristica;
  return detectarIdiomaComModelo(conversaInteira || ultimaMensagem, opts.conversationId);
}
