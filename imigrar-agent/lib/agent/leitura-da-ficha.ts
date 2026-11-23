// A FICHA DA ABERTURA LIDA PELO MODELO, QUANDO A LEITURA POR REGRA NÃO DÁ CONTA.
//
// A captura determinística (lib/agent/lead-capture.ts) reconhece uma lista de gentílicos
// e lugares. Tudo o que fica fora dela volta vazio: "Estou na Suíça", "Brasileiro"
// respondido seco, "moro em Madrid", "angolano". E a ficha vazia não é só um campo em
// branco no painel — é ela que monta o bloco "falta descobrir a nacionalidade" do prompt,
// e o modelo obedece: pergunta de novo o que a pessoa acabou de dizer. Foi exatamente o
// que o time viu nas conversas reais ("Sou português" / "Estou na Suíça" respondido com
// "você está no Brasil ou em Portugal?").
//
// Aqui o próprio modelo escolhido no painel lê as últimas mensagens e devolve os três
// campos da abertura. Só roda enquanto algum deles falta — depois de preenchidos, nenhuma
// chamada a mais. Só PREENCHE BURACO: o que veio da tool, da regra ou de um atendente vale
// mais e nunca é sobrescrito.

import { chamarChat, llmEmUso } from "@/lib/agent/llm";
import { registrarChamada, tokensDe, type UsoDeTokens } from "@/lib/custos/registro";
import type { Lead } from "@/lib/domain/types";
import { campoDaAberturaConhecido } from "@/lib/domain/ficha";

/** Quanto esperar pela leitura. Passou disso, o turno segue com o que a regra achou. */
const ESPERA_MAXIMA_MS = 8000;
/** As últimas mensagens bastam: a abertura acontece no começo, e o resto é custo. */
const MENSAGENS_LIDAS = 14;

export interface LeituraDaAbertura {
  nome: string | null;
  /** País da nacionalidade, em português ("Portugal", "Brasil", "Angola"). */
  nacionalidade: string | null;
  ondeEsta: "brasil" | "exterior" | null;
  /** País onde ela está agora, quando no exterior. */
  paisAtual: string | null;
  cidade: string | null;
}

const INSTRUCAO = `Você lê uma conversa de WhatsApp entre uma pessoa e o atendimento de um escritório de imigração no Brasil, e extrai SÓ o que a PESSOA disse sobre ELA MESMA.

Devolva APENAS um JSON, sem texto em volta:
{"nome": string|null, "nacionalidade": string|null, "onde_esta": "brasil"|"exterior"|null, "pais_atual": string|null, "cidade": string|null}

Regras:
- "nacionalidade": o PAÍS, em português (ex.: "Portugal", "Brasil", "Angola", "Venezuela"). Uma resposta seca vale: se o atendimento perguntou a nacionalidade e ela respondeu "Brasileiro", é "Brasil".
- Nacionalidade de marido, filho, mãe ou amigo NÃO é a dela. O nome de um idioma ("falo português") NÃO é nacionalidade.
- "onde_esta": onde ela está AGORA. "Estou na Suíça" → "exterior", pais_atual "Suíça". "Moro em São Paulo" → "brasil", cidade "São Paulo". Onde ela QUER ir não conta.
- "nome": só se ela disse o próprio nome. Não invente a partir do número ou de assinatura.
- Na dúvida, null. Um campo errado é pior que um vazio.`;

const VAZIO =
  /^(null|none|nil|n\/?a|-+|\?+|unknown|undefined|desconhecid[oa]?|desconocid[oa]?|n[ãa]o (sei|informad[oa]|dit[oa]|mencionad[oa])|no (sé|informad[oa])|sem informa[çc][ãa]o|indefinid[oa])\.?$/i;

/** Lê a resposta do modelo, aceitando o JSON cercado de ``` que alguns devolvem. */
export function interpretarLeitura(texto: string): LeituraDaAbertura | null {
  const bruto = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const inicio = bruto.indexOf("{");
  const fim = bruto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return null;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(bruto.slice(inicio, fim + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const texto60 = (v: unknown) => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    // Os modelos escrevem o "não sei" de vários jeitos. Gravado, ele não sai mais: a
    // ficha só preenche buraco, e "None" ocuparia o buraco para sempre.
    return t && t.length <= 60 && !VAZIO.test(t) ? t : null;
  };
  const onde = d.onde_esta === "brasil" || d.onde_esta === "exterior" ? d.onde_esta : null;
  const nome = texto60(d.nome);
  return {
    // Nome com dígito, arroba ou uma palavra só de uma letra é lixo de extração.
    nome: nome && /^[\p{L}][\p{L}' .-]{1,59}$/u.test(nome) ? nome : null,
    nacionalidade: texto60(d.nacionalidade),
    ondeEsta: onde,
    paisAtual: onde === "exterior" ? texto60(d.pais_atual) : null,
    cidade: texto60(d.cidade),
  };
}

/** O patch do lead a partir da leitura — só o que AINDA está vazio. */
export function patchDaLeitura(l: LeituraDaAbertura, lead: Lead | null): Partial<Lead> | null {
  const patch: Partial<Lead> = {};
  if (l.nome && !campoDaAberturaConhecido(lead, "nome")) patch.contactName = l.nome;
  if (l.nacionalidade && !campoDaAberturaConhecido(lead, "nacionalidade")) {
    patch.clientType = l.nacionalidade;
    patch.nacionalidade = l.nacionalidade;
  }
  // Se a ficha já diz onde ela está (mesmo só "no Brasil", sem cidade), a leitura não
  // escreve outro lugar por cima — duas respostas diferentes na mesma ficha.
  if (l.ondeEsta && !campoDaAberturaConhecido(lead, "onde")) {
    if (l.ondeEsta === "brasil") {
      patch.region = l.cidade ? `Brasil — ${l.cidade}` : "Brasil";
      patch.localizacao = "brasil";
    } else {
      patch.region = l.paisAtual ? `Exterior — ${l.paisAtual}` : "Exterior";
      patch.localizacao = "exterior";
      if (l.paisAtual && !lead?.paisExterior) patch.paisExterior = l.paisAtual;
    }
  }
  return Object.keys(patch).length ? patch : null;
}

/** Algum dos três campos da abertura ainda está vazio? */
export function faltaAbertura(lead: Lead | null): boolean {
  return (["nome", "nacionalidade", "onde"] as const).some((c) => !campoDaAberturaConhecido(lead, c));
}

/**
 * Pede ao modelo a leitura da abertura. Devolve `null` sem provedor, em teste, em erro ou
 * se demorar demais — e aí vale só o que a regra achou, como antes.
 */
export async function lerAberturaComLlm(
  mensagens: { role: "user" | "assistant"; content: string }[],
  conversationId: string,
): Promise<LeituraDaAbertura | null> {
  const llm = await llmEmUso();
  if (!llm) return null;
  const dialogo = mensagens
    .slice(-MENSAGENS_LIDAS)
    .map((m) => `${m.role === "user" ? "PESSOA" : "ATENDIMENTO"}: ${m.content.slice(0, 600)}`)
    .join("\n");
  if (!dialogo.trim()) return null;

  const inicio = Date.now();
  const chamada = (async () => {
    const res = await chamarChat(llm, {
      messages: [
        { role: "system", content: INSTRUCAO },
        { role: "user", content: dialogo },
      ],
      maxTokens: 160,
      temperature: 0,
    });
    const corpo = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: UsoDeTokens;
    };
    const { entrada, saida } = tokensDe(corpo.usage);
    void registrarChamada({
      provedor: llm.provedor,
      modelo: llm.modelo,
      tipo: "extracao",
      conversationId,
      tokensEntrada: entrada,
      tokensSaida: saida,
      duracaoMs: Date.now() - inicio,
      ok: res.ok,
      erro: res.ok ? undefined : `HTTP ${res.status}`,
    });
    if (!res.ok) return null;
    return interpretarLeitura(corpo.choices?.[0]?.message?.content ?? "");
  })();

  try {
    return await Promise.race([
      chamada,
      new Promise<null>((r) => setTimeout(() => r(null), ESPERA_MAXIMA_MS)),
    ]);
  } catch (err) {
    console.error("[leitura-da-ficha] falhou:", err instanceof Error ? err.message : err);
    return null;
  }
}
