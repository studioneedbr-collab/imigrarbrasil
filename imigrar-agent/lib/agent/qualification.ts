// Extração heurística de dados de qualificação a partir do texto da conversa.
// Usado pelo agente MOCK (runMock) para avançar o fluxo sem repetir perguntas,
// e disponível para testes. Não substitui o DeepSeek — é um fallback determinístico.

export interface LeadSlots {
  name?: string;
  company?: string;
  service?: string; // nome canônico do catálogo (primário)
  servicesAll?: string[]; // todos os serviços mencionados (múltiplos)
  employees?: number;
  region?: string;
  timing?: string; // rótulo legível
  urgency?: "immediate" | "short" | "medium" | "long";
  cnpj?: string;
  email?: string;
}

const SERVICE_PATTERNS: Array<{ re: RegExp; name: string }> = [
  { re: /porteiro|portaria/, name: "Porteiro" },
  // Vigia e controlador de acesso são funções próprias do catálogo, com sindicato e piso
  // diferentes do porteiro. Vêm depois de "porteiro" porque "porteiro/vigia" é porteiro.
  { re: /vigia|vigil[âa]ncia|controlador de acesso/, name: "Vigia" },
  { re: /recepc/, name: "Recepcionista" },
  { re: /zelador|zeladoria/, name: "Zelador" },
  { re: /jardin/, name: "Jardineiro" },
  { re: /piscina|guardi[aã]o/, name: "Operador de Piscina" },
  {
    re: /limpeza|faxin|asg|auxiliar de servi|servi[cç]os gerais|servente|conserva/,
    name: "Auxiliar de Serviços Gerais",
  },
];

const NEIGHBORHOODS = [
  "botafogo", "copacabana", "ipanema", "leblon", "centro", "barra da tijuca", "barra",
  "tijuca", "flamengo", "catete", "laranjeiras", "méier", "meier", "niterói", "niteroi",
  "gávea", "gavea", "jacarepaguá", "jacarepagua", "recreio", "campo grande", "madureira",
  "icaraí", "icarai", "são conrado", "sao conrado", "humaitá", "humaita",
];

/**
 * Praças fora do Rio, para o motor receber a região e cotar pela CCT certa (ou recusar).
 *
 * É uma lista curta e explícita de propósito, e NÃO reaproveita os reconhecedores de
 * lib/agent/cct.ts: aqueles são generosos (aceitam "serra", "norte", "gama") porque só
 * rodam depois que alguém já disse que a região é aquela. Aqui a frase é livre, e
 * "zona norte" ou "a serra do prédio" viraria Nordeste ou Espírito Santo sem querer.
 * Só entram nomes de estado, siglas e capitais que não são ambíguos no Rio.
 */
const PRACAS_DE_FORA =
  /(?<![0-9a-zà-ÿ_])(s(?:ã|a)o paulo|sp|campinas|guarulhos|osasco|santo andr[ée]|belo horizonte|minas gerais|mg|uberl[âa]ndia|juiz de fora|bras[íi]lia|distrito federal|df|vit[óo]ria|esp[íi]rito santo|vila velha|cariacica|curitiba|paran[áa]|pr|londrina|maring[áa]|porto alegre|rio grande do sul|rs|caxias do sul|florian[óo]polis|santa catarina|sc|joinville|blumenau|mato grosso do sul|ms|dourados|salvador|bahia|recife|pernambuco|fortaleza|cear[áa]|natal|macei[óo]|aracaju|teresina|s(?:ã|a)o lu[íi]s|jo(?:ã|a)o pessoa|goi[âa]nia|goi[áa]s|cuiab[áa]|mato grosso|manaus|amazonas|bel[ée]m|par[áa]|porto velho|rio branco|boa vista|macap[áa]|palmas)(?![0-9a-zà-ÿ_])/;

// Termos genéricos que NÃO são nome de empresa (evita falso positivo após "empresa").
const COMPANY_STOPWORDS = new Set([
  "caro", "cara", "barato", "barata", "boa", "boas", "bom", "bons", "ruim", "mesma", "mesmo",
  "outra", "outro", "outras", "outros", "nova", "novo", "propria", "própria", "proprio", "próprio",
  "grande", "pequena", "pequeno", "seria", "servico", "serviço", "servicos", "serviços",
  "que", "de", "da", "do", "a", "o", "e", "muito", "tambem", "também", "melhor", "atual", "certa",
]);

function titleCase(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function extractSlots(raw: string): LeadSlots {
  const text = raw.toLowerCase();
  const slots: LeadSlots = {};

  // Serviço(s) — coleta todos os mencionados; o primário é o primeiro na ordem de padrões
  const matched: string[] = [];
  for (const { re, name } of SERVICE_PATTERNS) {
    if (re.test(text) && !matched.includes(name)) matched.push(name);
  }
  if (matched.length) {
    slots.service = matched[0];
    slots.servicesAll = matched;
  }

  // Nº de funcionários — número adjacente a uma função ou a "funcionários/postos/pessoas".
  const empMatch =
    text.match(/(\d{1,3})\s*(?:auxiliar|asg|servente|porteiro|vigia|recepc|zelador|jardineiro|piscina)/) ||
    text.match(/(\d{1,3})\s*(?:funcion|pessoa|posto|colaborador|profissional|vaga)/) ||
    text.match(
      /(?:preciso de|quero|seriam|s[aã]o|ser[aã]o|contratar|uns|umas?|cerca de|aproximadamente|aprox\w*|por volta de|tipo|talvez)\s+(\d{1,3})/,
    );
  if (empMatch) {
    const n = Number(empMatch[1]);
    if (n > 0 && n < 1000) slots.employees = n;
  }

  // CNPJ
  const cnpj = raw.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
  if (cnpj) slots.cnpj = cnpj[0];

  // E-mail
  const email = raw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (email) slots.email = email[0].toLowerCase();

  // Nome — captura até 2 palavras, descartando conectores ("da", "de", "do"...)
  const nameMatch = raw.match(
    /(?:meu nome (?:é|eh|e)|me chamo|sou (?:o|a)|aqui (?:é|eh|quem fala é))\s+([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)?)/i,
  );
  if (nameMatch) {
    const connectors = new Set(["da", "de", "do", "das", "dos", "e", "na", "no", "a", "o"]);
    const parts = nameMatch[1].split(/\s+/).filter((w) => !connectors.has(w.toLowerCase()));
    if (parts.length) slots.name = titleCase(parts.slice(0, 2).join(" "));
  }

  // Empresa — o gatilho ("empresa X") deve ser seguido por UM espaço só (não cruza o
  // limite entre mensagens, unidas por 2+ espaços) e a 1ª palavra não pode ser um termo
  // genérico (evita "outra empresa boa" / "minha empresa" capturar lixo).
  const compMatch = raw.match(
    /(?:empresa|condom[ií]nio|somos (?:a|o)|trabalho (?:na|no)|represento (?:a|o))\s([A-Za-zÀ-ú0-9][\wÀ-ú&.\-]{0,29}(?:\s[A-Za-zÀ-ú0-9][\wÀ-ú&.\-]{0,29})?)/i,
  );
  if (compMatch) {
    const c = compMatch[1]
      .replace(/\s+cnpj.*$/i, "")
      .replace(/\s+\d[\d.\-/]*$/, "")
      .trim();
    const first = c.split(/\s+/)[0]?.toLowerCase();
    if (c && first && !COMPANY_STOPWORDS.has(first)) slots.company = titleCase(c);
  }

  // Região — bairro do Rio, praça de fora, ou marcador explícito ("região de X").
  //
  // A ordem importa e é deliberada: bairro do Rio primeiro. "Campo Grande" e "Centro"
  // são bairros cariocas antes de serem qualquer outra coisa, e o cliente da Shine Rio
  // quase sempre é do Rio.
  const nb = NEIGHBORHOODS.find((n) => text.includes(n));
  if (nb) {
    slots.region = titleCase(nb);
  } else {
    const praca = text.match(PRACAS_DE_FORA);
    if (praca) {
      // Fora do Rio o piso é outro, e é a CCT daquela praça que manda. Sem reconhecer a
      // praça aqui, o cliente de São Paulo ouvia o preço do Rio na conversa: o motor já
      // sabia cotar por praça, mas nunca recebia a região.
      slots.region = titleCase(praca[0]);
    } else {
      const regMatch = text.match(
        /(?:regi[aã]o (?:de |do |da )?|bairro (?:de |do )?|fica (?:em|no|na) |atendimento (?:em|no|na) )([a-zà-ú][a-zà-ú]{2,20}(?: [a-zà-ú]{2,20})?)/,
      );
      if (regMatch) {
        const cand = regMatch[1].trim();
        if (cand.length >= 3 && !/^(que|qual|quanto|breve|casa|obra|frente)/.test(cand)) {
          slots.region = titleCase(cand);
        }
      }
    }
  }

  // Prazo / urgência
  if (/imediat|urgent|o quanto antes|para (?:já|ja)|essa semana|hoje|agora/.test(text)) {
    slots.timing = "imediato";
    slots.urgency = "immediate";
  } else if (/semana que vem|pr[oó]xima semana|este m[eê]s|em (?:1|2|3) semanas/.test(text)) {
    slots.timing = "curto prazo";
    slots.urgency = "short";
  } else if (/pr[oó]ximo m[eê]s|m[eê]s que vem|em (?:1|2) mes/.test(text)) {
    slots.timing = "médio prazo";
    slots.urgency = "medium";
  } else if (/sem pressa|futuro|mais para frente|planejando|ano que vem/.test(text)) {
    slots.timing = "longo prazo";
    slots.urgency = "long";
  }

  return slots;
}

const WORD_NUMBERS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, três: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, quatorze: 14, catorze: 14, quinze: 15, vinte: 20, trinta: 30,
};

// Extrai uma contagem de uma mensagem curta (resposta à pergunta "quantos?"):
// dígito ("2", "'2'") ou número por extenso ("dois"). Ignora aspas/pontuação.
export function parseCount(raw: string): number | undefined {
  const t = raw.toLowerCase().replace(/['"´`.]/g, " ").trim();
  const digit = t.match(/\b(\d{1,3})\b/);
  if (digit) {
    const n = Number(digit[1]);
    if (n > 0 && n < 1000) return n;
  }
  for (const [w, n] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${w}\\b`).test(t)) return n;
  }
  return undefined;
}

// Gatilhos de transferência para atendimento humano (checar na última mensagem).
export const TRANSFER_TRIGGER =
  /(trabalhist|processo|dem[ií]ss[aã]o|f[eé]rias|folha de pagamento|jur[ií]dic|advogad|cancelar(?:\s+o)?\s+contrato|rescis[aã]o|reclama[çc][aã]o|lgpd|cobran[çc]a|falar com (?:um |uma )?(?:humano|atendente|pessoa|consultor|respons[aá]vel))/i;
