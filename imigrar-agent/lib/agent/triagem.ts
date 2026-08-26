// LEITURA DETERMINÍSTICA DA CONVERSA — o que dá para saber sem perguntar de novo.
//
// Substitui a extração herdada da base comercial (que procurava função de limpeza,
// quantidade de postos, CNPJ e bairro do Rio). Aqui os campos são os que o time jurídico
// precisa ter na mão: nacionalidade, onde a pessoa está agora, o que ela quer conseguir,
// como ela entrou / o que tem hoje, e se há prazo.
//
// Nada aqui AFIRMA informação migratória. É só reconhecimento do que a pessoa escreveu,
// para o dossiê se preencher sozinho e para a Ana não reperguntar.

export interface TriagemSlots {
  name?: string;
  email?: string;
  /** Nacionalidade, quando a pessoa a diz ("sou venezuelana", "sou do Haiti"). */
  nacionalidade?: string;
  /** Onde ela está AGORA: "Brasil" (com a cidade quando aparece) ou o país de fora. */
  ondeEsta?: string;
  /** Caminhos migratórios citados: visto, regularização, naturalização, refúgio… */
  caminhos?: string[];
  /** Como entrou / o que tem hoje, na forma como ela contou. */
  situacao?: string;
  urgency?: "immediate" | "short" | "medium" | "long";
}

/**
 * Gentílico → país. A lista cobre as origens que mais aparecem na imigração para o
 * Brasil, e é explícita de propósito: adivinhar nacionalidade por heurística de sufixo
 * ("-ano", "-ense") produziria "Sou fulano" → nacionalidade "Fulano".
 *
 * A ordem importa nas entradas que se contêm ("guineense" antes de "guiné").
 */
const NACIONALIDADES: Array<[RegExp, string]> = [
  // Cada linha aceita a grafia em português, espanhol e inglês. Não é preciosismo: o
  // dossiê ficava VAZIO para quem escrevia "soy venezolana" (es) ou "I'm Venezuelan" (en),
  // e o advogado abria o painel sem nada — num atendimento em que metade das pessoas não
  // escreve em português.
  [/venezuelan[oa]s?|venezolan[oa]s?|da venezuela|de venezuela|from venezuela/i, "Venezuela"],
  [/haitian[oa]s?|do haiti|de haiti|from haiti/i, "Haiti"],
  [/bolivian[oa]s?|da bol[íi]via|from bolivia/i, "Bolívia"],
  [/colombian[oa]s?|da col[ôo]mbia|de colombia|from colombia/i, "Colômbia"],
  [/peruan[oa]s?|peruvian|do peru|del peru|from peru/i, "Peru"],
  [/equatorian[oa]s?|do equador/i, "Equador"],
  [/paraguai[oa]s?|paraguay[oa]s?|do paraguai|del paraguay|from paraguay/i, "Paraguai"],
  [/uruguai[oa]s?|do uruguai/i, "Uruguai"],
  [/argentin[oa]s?|da argentina/i, "Argentina"],
  [/chilen[oa]s?|do chile/i, "Chile"],
  [/cuban[oa]s?|de cuba|from cuba/i, "Cuba"],
  [/dominican[oa]s?|da rep[úu]blica dominicana/i, "República Dominicana"],
  [/mexican[oa]s?|do m[ée]xico/i, "México"],
  [/guineense|da guin[ée]-bissau|de guin[ée]-bissau/i, "Guiné-Bissau"],
  [/angolan[oa]s?|de angola|da angola|from angola|in angola/i, "Angola"],
  [/mo[çc]ambican[oa]s?|de mo[çc]ambique/i, "Moçambique"],
  [/cabo-?verdian[oa]s?|de cabo verde/i, "Cabo Verde"],
  [/senegal[êe]s(?:a|es)?|senegalese|do senegal|from senegal/i, "Senegal"],
  [/nigerian[oa]s?|da nig[ée]ria|de nigeria|from nigeria/i, "Nigéria"],
  [/ganes(?:a|es)?|de gana/i, "Gana"],
  [/congol[êe]s(?:a|es)?|do congo|da rep[úu]blica democr[áa]tica do congo/i, "Congo"],
  [/camaron[êe]s(?:a|es)?|dos camar[õo]es/i, "Camarões"],
  [/etíope|eti[óo]pe|da eti[óo]pia/i, "Etiópia"],
  [/somali|da som[áa]lia/i, "Somália"],
  [/marroquin[oa]s?|do marrocos/i, "Marrocos"],
  [/s[íi]ri[oa]s?|syrian|da s[íi]ria|de siria|from syria/i, "Síria"],
  [/libanes(?:a|es)?|do l[íi]bano/i, "Líbano"],
  [/palestin[oa]s?|da palestina/i, "Palestina"],
  [/afeg[ãa][on]e?s?|do afeganist[ãa]o/i, "Afeganistão"],
  [/iranian[oa]s?|do ir[ãa]/i, "Irã"],
  [/iraquian[oa]s?|do iraque/i, "Iraque"],
  [/turc[oa]s?|da turquia/i, "Turquia"],
  [/ucranian[oa]s?|da ucr[âa]nia/i, "Ucrânia"],
  [/russ[oa]s?|da r[úu]ssia/i, "Rússia"],
  [/chin[êe]s(?:a|es)?|da china/i, "China"],
  [/indian[oa]s?|da [íi]ndia/i, "Índia"],
  [/bengal[êe]s(?:a|es)?|de bangladesh|do bangladesh/i, "Bangladesh"],
  [/paquistanes(?:a|es)?|do paquist[ãa]o/i, "Paquistão"],
  [/nepal[êe]s(?:a|es)?|do nepal/i, "Nepal"],
  [/filipin[oa]s?|das filipinas/i, "Filipinas"],
  [/indon[ée]si[oa]s?|da indon[ée]sia/i, "Indonésia"],
  [/vietnamit[ao]s?|do vietn[ãa]/i, "Vietnã"],
  [/coreano?s?|da coreia/i, "Coreia"],
  [/japon[êe]s(?:a|es)?|do jap[ãa]o/i, "Japão"],
  [/portugu[êe]s(?:a|es)?|de portugal/i, "Portugal"],
  [/espanh[oó]l(?:a|es)?|da espanha/i, "Espanha"],
  [/italian[oa]s?|da it[áa]lia/i, "Itália"],
  [/franc[êe]s(?:a|es)?|da fran[çc]a/i, "França"],
  [/alem[ãa][on]?s?|da alemanha/i, "Alemanha"],
  [/norte-?american[oa]s?|dos estados unidos|dos eua/i, "Estados Unidos"],
];

/**
 * O gentílico só vale quando a pessoa está falando DELA. "Meu marido é sírio" não é ela.
 * Nos três idiomas — "soy venezolana" e "I'm Venezuelan" são a mesma frase.
 */
const DIZ_DE_SI =
  /\b(sou|s[ãa]o eu|eu sou|somos|minha nacionalidade|meu pa[íi]s|nasci|vim d[eoa]|venho d[eoa]|cheguei d[eoa]|sa[íi] d[eoa]|soy|somos de|mi nacionalidad|mi pa[íi]s|nac[íi]|vengo de|sal[íi] de|i am|i'm|im a|my nationality|i come from|i'm from|i am from)\b/i;

export function detectarNacionalidade(texto: string): string | undefined {
  if (!DIZ_DE_SI.test(texto)) return undefined;
  for (const [re, pais] of NACIONALIDADES) {
    if (re.test(texto)) return pais;
  }
  return undefined;
}

// ONDE A PESSOA ESTÁ AGORA. A distinção que muda o atendimento inteiro é só uma: no
// Brasil ou fora. A cidade, quando ela diz, entra junto porque o time jurídico usa.
//
// A leitura é em duas partes — o VERBO de presença e o LUGAR — porque juntar os dois num
// regex só significava listar à mão cada cidade depois de cada verbo, e "moro em Boa
// Vista" (uma das cidades onde este atendimento mais acontece) passava batido.
const PRESENCA =
  /\b(estou|est[áa]|t[ôo]|moro|morando|vivo|vivendo|cheguei|chegamos|entrei|estamos|resido|fico|vim para|estoy|vivimos|llegu[ée]|llegamos|entr[ée]|resido en|i am|i'm|i live|i've been|i have been|i arrived|i came|i moved)\b/i;
const AQUI_NO_BRASIL =
  /\b(no brasil|aqui no brasil|aqui em|aqui no|aqui na|en brasil|aqu[íi] en|in brazil|here in brazil)\b/i;
const NO_EXTERIOR =
  /\b(estou|t[ôo]|moro|morando|vivo|ainda estou|continuo|estoy|sigo|todav[íi]a estoy|a[úu]n estoy|i am|i'm|i live|i'm still|i am still)\b[^.]{0,25}\b(fora|no exterior|fora do brasil|no meu pa[íi]s|afuera|fuera de brasil|en el exterior|en mi pa[íi]s|abroad|outside brazil|overseas|in my country)\b|\b(ainda n[ãa]o (vim|cheguei|fui)|antes de (viajar|embarcar|vir)|todav[íi]a no (vine|llegu[ée])|antes de (viajar|venir)|haven't (come|arrived|travelled|traveled) yet|before (i )?(travel|travelling|coming))\b/i;

const CIDADE_BR =
  /\b(?:em|no|na|en|in)\s+(s[ãa]o paulo|rio de janeiro|bras[íi]lia|curitiba|porto alegre|belo horizonte|salvador|recife|fortaleza|manaus|bel[ée]m|boa vista|pacaraima|foz do igua[çc]u|corumb[áa]|florian[óo]polis|goi[âa]nia|campinas|guarulhos)\b/i;

export function detectarOndeEsta(texto: string): string | undefined {
  // O exterior vem primeiro: "estou fora do Brasil" também contém a palavra "Brasil".
  if (NO_EXTERIOR.test(texto)) {
    // Quando ela diz de onde está falando, o país vale mais do que um "exterior" seco.
    for (const [re, pais] of NACIONALIDADES) {
      if (re.test(texto)) return `Exterior — ${pais}`;
    }
    return "Exterior";
  }
  if (PRESENCA.test(texto)) {
    const cidade = texto.match(CIDADE_BR)?.[1];
    if (cidade) return `Brasil — ${titleCase(cidade)}`;
    if (AQUI_NO_BRASIL.test(texto)) return "Brasil";
  }
  return undefined;
}

// O QUE A PESSOA PROCURA. São os caminhos que a Imigrar Brasil atende — a mesma lista da
// base de conhecimento. Reconhecer NÃO é informar: o que a Ana diz sobre cada um continua
// vindo do material oficial.
const CAMINHOS: Array<[RegExp, string]> = [
  [/\bref[úu]gio|refugiad|as[íi]lo|conare|persegui[çc][ãa]o|refugio|asylum|refugee|persecution\b/i, "Refúgio"],
  [
    /\breuni[ãa]o familiar|reunificaci[óo]n familiar|family reuni(?:on|fication)|juntar (?:com|a) (?:minha|meu) (?:fam[íi]lia|esposa|marido|filh)|trazer (?:minha|meu) (?:fam[íi]lia|esposa|marido|filh|m[ãa]e|pai)|traer a mi (?:familia|esposa|esposo|hij)|bring my (?:family|wife|husband|son|daughter|child|mother|father|parents)\b/i,
    "Reunião familiar",
  ],
  [
    /\bnaturaliza[çc][ãa]o|naturalizaci[óo]n|naturalisation|naturalization|virar brasileir|ser brasileir|cidadania brasileira|ciudadan[íi]a brasile|brazilian citizenship\b/i,
    "Naturalização",
  ],
  [/\bmercosul|mercosur\b/i, "Residência pelo Mercosul"],
  [
    /\bregulariza[çc][ãa]o|me regularizar|autoriza[çc][ãa]o de resid[êe]ncia|resid[êe]ncia|\bcrnm\b|rnm|renova[çc][ãa]o do (?:meu )?documento|regularizaci[óo]n|regularizar mi situaci[óo]n|residencia|regularis|regulariz|residence permit|stay in brazil|quedarme en brasil\b/i,
    "Regularização migratória",
  ],
  [/\bvisto|\bvisa\b|\bvisas\b/i, "Visto"],
];

/**
 * DOCUMENTO VENCIDO NÃO É PEDIDO DE VISTO.
 *
 * "Meu visto venceu" casa com a palavra `visto` e sairia rotulado como **Visto** — que
 * neste domínio significa uma coisa específica: pedido feito no CONSULADO, por quem ainda
 * está fora. Quem já está aqui com o documento vencido está no caminho oposto,
 * regularização, e é um caso concreto para o advogado. O rótulo errado manda o advogado
 * abrir a conversa esperando o problema errado.
 */
const DOCUMENTO_VENCIDO =
  /\b(visto|documento|crnm|rnm|passaporte|autoriza[çc][ãa]o de resid[êe]ncia|resid[êe]ncia|prazo de estada)\b[^.]{0,25}\b(venceu|vencid[oa]|expirou|expirad[oa])\b|\b(estou irregular|situa[çc][ãa]o irregular|indocumentad|passei do prazo|overstay)\b/i;

export function detectarCaminhos(texto: string): string[] {
  const achados: string[] = [];
  for (const [re, nome] of CAMINHOS) {
    if (re.test(texto) && !achados.includes(nome)) achados.push(nome);
  }
  if (DOCUMENTO_VENCIDO.test(texto)) {
    if (!achados.includes("Regularização migratória")) achados.push("Regularização migratória");
    // O "Visto" só sobrevive se ela falar de pedir um, lá fora — não do que venceu aqui.
    if (!/\b(consulado|embaixada|solicitar (?:o )?visto|pedir (?:o )?visto|tirar (?:o )?visto)\b/i.test(texto)) {
      const i = achados.indexOf("Visto");
      if (i >= 0) achados.splice(i, 1);
    }
  }
  return achados;
}

/**
 * COMO A PESSOA ENTROU / O QUE ELA TEM HOJE. É o que o advogado lê primeiro, e é a
 * informação que ela mais odeia repetir. Guarda a frase DELA, curta, em vez de tentar
 * classificar — classificar aqui seria opinar sobre situação migratória.
 */
const SITUACAO_SINAIS =
  /\b(entrei (?:por|pel[oa]|com|sem)|cheguei (?:por|pel[oa]|com|de)|vim (?:com|por|de)|tenho (?:protocolo|crnm|rnm|cpf|visto|passaporte)|estou com (?:protocolo|crnm|visto)|meu (?:visto|documento|crnm|passaporte|protocolo)|sem documento|indocumentad|situa[çc][ãa]o irregular|venceu|vencid[oa]|expirou|prazo de estada)\b/i;

export function detectarSituacao(texto: string): string | undefined {
  if (!SITUACAO_SINAIS.test(texto)) return undefined;
  // A frase em que o sinal aparece, cortada — é o contexto que serve ao advogado.
  //
  // O corte olha TRÊS separadores, e o terceiro é o que importa: o chamador passa a
  // conversa inteira, com as mensagens unidas por dois espaços. Sem ele, quem escreveu
  // "oi" e só depois contou a história tinha o "oi" grudado no começo da situação, e o
  // painel mostrava ao advogado "oi  sou venezuelana, moro em Boa Vista e meu visto
  // venceu" como se fosse uma frase só.
  const frase = texto
    .split(/(?<=[.!?])\s+|\n+|\s{2,}/)
    .find((f) => SITUACAO_SINAIS.test(f))
    ?.trim();
  if (!frase) return undefined;
  return frase.length > 160 ? `${frase.slice(0, 157)}…` : frase;
}

/**
 * MENSAGEM SEM CONTEÚDO — "oi", "sim", "ta", "?????", "kadksd".
 *
 * Mora aqui, junto do resto da leitura da mensagem, porque dois lugares precisam dela: o
 * atendimento sem LLM (para reconvidar em vez de disparar mais uma pergunta de cadastro) e
 * a rede anti-repetição (para não acusar o agente de ter travado quando quem não disse
 * nada foi a pessoa).
 */
const RECHEIO =
  /^(oi+|ol[aá]+|al[oô]+|hola|hi|hello|hey|bom dia|boa tarde|boa noite|buenas?( d[ií]as| tardes| noches)?|good (morning|afternoon|evening)|tudo bem|td bem|blz|beleza|ok+|okay|t[aá]|ta bom|sim|s[íi]|yes|n[ãa]o|no|nop|sei l[aá]|n[ãa]o sei|talvez|maybe|certo|entendi|uhum|aham|hmm+|\?+|\.+|!+|,|\s)+$/i;

/** Uma palavra é plausível quando tem vogal e não empilha consoantes ("kadksd" não é). */
function pareceTexto(palavra: string): boolean {
  if (!/[aeiou]/i.test(palavra)) return false;
  return !/[bcdfghjklmnpqrstvwxyz]{4,}/i.test(palavra);
}

export function mensagemSemConteudo(texto: string): boolean {
  const t = (texto ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!t) return true;
  if (RECHEIO.test(t)) return true;
  const palavras = t.split(/[^a-z0-9]+/i).filter((p) => p.length >= 2);
  if (palavras.length === 0) return true;
  // Mensagem curta em que nenhuma palavra parece palavra: teclado batido, engano.
  if (palavras.length <= 2 && !palavras.some(pareceTexto)) return true;
  return false;
}

function titleCase(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/* ══════════════════════════════════════════════════════════════════════════
   O CASO, COMO O ADVOGADO PRECISA LER
   ══════════════════════════════════════════════════════════════════════════

   A v1 deste agente coletava quatro coisas: nacionalidade, onde a pessoa está,
   o que ela quer e se há prazo. Era o suficiente para INFORMAR.

   A v2 é triagem, não informação. O que o advogado precisa antes de pegar o caso é
   outra coisa: COMO a pessoa entrou (e se passou pelo controle migratório), QUE
   documentos ela tem do país de origem, se há VÍNCULO familiar no Brasil, se já
   existe documento brasileiro, e se há alguma DECISÃO NEGATIVA com prazo correndo.
   São essas cinco que decidem a via e a urgência — e nenhuma delas era lida.        */

/** Passou pelo controle migratório na entrada? É o que separa uma via administrativa
 *  simples de um caso que precisa de advogado desde o primeiro dia. */
export type Entrada = "com_controle" | "sem_controle";

export interface CasoTriagem {
  nacionalidade?: string;
  ondeEsta?: string;
  entrada?: Entrada;
  /** Como ela contou a entrada, com as palavras dela. */
  entradaRelato?: string;
  /** Documentos do país de origem que ela mencionou ter ou não ter. */
  passaporte?: "valido" | "vencido" | "nao_tem";
  certidaoNascimento?: boolean;
  antecedentes?: boolean;
  /** Vínculo familiar no Brasil, como ela contou. */
  vinculoFamiliar?: string;
  /** Documentos brasileiros que ela já tem (CRNM, protocolo, DPRNM, CPF). */
  documentosBrasileiros: string[];
  /** Multa, notificação de saída, indeferimento — o que faz o prazo correr. */
  decisaoNegativa?: string;
  objetivo?: string[];
  prazo?: "immediate" | "short" | "medium" | "long";
  /** Disse que não tem condições de pagar. */
  semCondicoes?: boolean;
  /** Criança ou adolescente no caso, sem os dois pais. */
  menorEnvolvido?: boolean;
  /** A Polícia Federal recusou documento ou negou isenção. */
  recusaPf?: boolean;
}

// ── Entrada e controle migratório ───────────────────────────────────────────
const ENTRADA_COM_CONTROLE =
  /\b(entrei|cheguei|vim|passei)\b[^.]{0,40}\b(aeroporto|voo|avi[ãa]o|posto de fronteira|controle migrat[óo]rio|pol[íi]cia federal na entrada|carimb(?:o|ei|aram))\b|\b(tenho|tem|tinha) carimbo\b|\bcarimb(?:aram|ou) (?:o )?meu passaporte\b/i;
const ENTRADA_SEM_CONTROLE =
  /\b(entrei|cheguei|vim|passei|atravessei|cruzei)\b[^.]{0,45}\b(sem passar|sem carimbo|sem controle|sem registro|por (?:um )?(?:atalho|trilha|mata|rio)|escondid|clandestin|por baixo|irregularmente|a p[ée] pela fronteira)\b|\bn[ãa]o (?:passei|fui)\b[^.]{0,20}\b(controle|pol[íi]cia federal|imigra[çc][ãa]o)\b|\bn[ãa]o tenho carimbo\b|\bsem carimbo (?:de )?entrada\b/i;

export function detectarEntrada(texto: string): Entrada | undefined {
  // O "sem controle" vem primeiro: "entrei pela fronteira sem passar pelo controle"
  // contém as duas coisas, e a que decide o caso é a ausência do registro.
  if (ENTRADA_SEM_CONTROLE.test(texto)) return "sem_controle";
  if (ENTRADA_COM_CONTROLE.test(texto)) return "com_controle";
  return undefined;
}

// ── Documentos do país de origem ────────────────────────────────────────────
const PASSAPORTE_VENCIDO =
  /\b(passaporte|pasaporte|passport)\b[^.]{0,25}\b(venceu|vencid[oa]|expirou|expirad[oa]|expired|caduc)\b|\b(venceu|vencid[oa])\b[^.]{0,15}\bpassaporte\b/i;
const PASSAPORTE_NAO_TEM =
  /\b(n[ãa]o tenho|sem|perdi|roubaram|no tengo|don'?t have|lost)\b[^.]{0,20}\b(passaporte|pasaporte|passport)\b/i;
const PASSAPORTE_TEM =
  /\b(tenho|tengo|i have)\b[^.]{0,20}\b(passaporte|pasaporte|passport)\b[^.]{0,20}\b(v[áa]lido|valid|em dia)\b|\bmeu passaporte (?:est[áa] )?(?:v[áa]lido|em dia)\b/i;

const CERTIDAO = /\b(certid[ãa]o de nascimento|acta de nacimiento|partida de nacimiento|birth certificate)\b/i;
const ANTECEDENTES =
  /\b(antecedentes criminais|antecedentes penales|certificado de antecedentes|criminal record|police clearance|folha corrida)\b/i;
const NEGATIVA = /\b(n[ãa]o tenho|sem|n[ãa]o consigo|no tengo|don'?t have|nunca tirei|perdi)\b/i;

// ── Vínculo familiar no Brasil ──────────────────────────────────────────────
const VINCULO =
  /\b(filh[oa]s?|esposa|esposo|marido|mulher|c[ôo]njuge|companheir[oa]|m[ãa]e|pai|irm[ãa]os?|neto|av[óo])\b[^.]{0,40}\b(brasileir[oa]s?|nascid[oa] (?:aqui|no brasil)|tem (?:crnm|resid[êe]ncia)|com resid[êe]ncia|mora (?:aqui|no brasil)|[ée] daqui)\b|\b(sou )?casad[oa] com (?:um[a]? )?brasileir/i;

// ── Documentos brasileiros que já tem ───────────────────────────────────────
const DOCS_BR: Array<[RegExp, string]> = [
  [/\bcrnm\b/i, "CRNM"],
  [/\bdprnm\b/i, "DPRNM"],
  [/\bprotocolo\b/i, "Protocolo"],
  [/\bcpf\b/i, "CPF"],
  [/\brnm\b/i, "RNM"],
  [/\bcarteira de trabalho|ctps\b/i, "CTPS"],
];

// ── Decisão negativa / prazo correndo ───────────────────────────────────────
const DECISAO_NEGATIVA: Array<[RegExp, string]> = [
  [/\bmulta\b[^.]{0,30}\b(migrat[óo]ri|pol[íi]cia federal|pf|estada|perman[êe]ncia)\b|\brecebi uma multa\b|\bfui multad/i, "Multa migratória notificada"],
  [/\bnotifica[çc][ãa]o de sa[íi]da|notificad[oa] (?:a|para) (?:sair|deixar o pa[íi]s)|ordem de sa[íi]da\b/i, "Notificação de saída do país"],
  [/\bindefer|negad[oa]|negaram|recusad[oa]|denied|rechazad/i, "Pedido indeferido"],
  [/\bexig[êe]ncia\b|\bnotifica[çc][ãa]o\b|\bintima[çc][ãa]o\b/i, "Exigência/notificação recebida"],
];

// ── A Polícia Federal recusou algo ──────────────────────────────────────────
const RECUSA_PF =
  /\b(pol[íi]cia federal|pf|delegacia)\b[^.]{0,45}\b(recusou|n[ãa]o aceitou|negou|n[ãa]o quis|devolveu|mandou voltar)\b|\bnegaram (?:a )?isen[çc][ãa]o\b|\bn[ãa]o aceitaram (?:meus? )?documento/i;

// ── Criança ou adolescente ──────────────────────────────────────────────────
const MENOR =
  /\b(meu |minha )?(filh[oa]|crian[çc]a|menor|adolescente|beb[êe]|neném|nen[êe])\b[^.]{0,45}\b(sozinh[oa]|desacompanhad[oa]|sem (?:o )?pai|sem (?:a )?m[ãa]e|s[óo] comigo|s[óo] eu)\b|\b(crian[çc]a|menor|adolescente) desacompanhad/i;

// ── Sem condições de pagar ──────────────────────────────────────────────────
const SEM_CONDICOES =
  /\b(n[ãa]o tenho (?:dinheiro|condi[çc][õo]es|como pagar)|n[ãa]o posso pagar|sem dinheiro|sem condi[çc][õo]es|muito caro para mim|n[ãa]o tenho grana|estou desempregad[oa] e n[ãa]o|baixa renda|hipossuficien|no tengo dinero|no puedo pagar|i can'?t afford|no money)\b/i;

/**
 * A ORIENTAÇÃO TÉCNICA POR NACIONALIDADE. Serve para DIRECIONAR a pergunta, nunca para
 * ser explicada à pessoa — dizer "você provavelmente se enquadra no Mercosul" é afirmar
 * enquadramento, que é análise de caso e é do advogado.
 */
const MODALIDADE_POR_PAIS: Record<string, string> = {
  Argentina: "Acordo Mercosul", Bolívia: "Acordo Mercosul", Chile: "Acordo Mercosul",
  Colômbia: "Acordo Mercosul", Equador: "Acordo Mercosul", Paraguai: "Acordo Mercosul",
  Peru: "Acordo Mercosul", Uruguai: "Acordo Mercosul",
  Venezuela: "Política migratória", Suriname: "Política migratória", Guiana: "Política migratória",
  Senegal: "Política migratória nacional",
  Haiti: "Acolhida humanitária", Afeganistão: "Acolhida humanitária", Síria: "Acolhida humanitária",
};

export function modalidadeProvavel(nacionalidade?: string): string | undefined {
  if (!nacionalidade) return undefined;
  return MODALIDADE_POR_PAIS[nacionalidade] ?? "A definir (família, estudo, trabalho ou refúgio)";
}

/** Lê o caso inteiro a partir de tudo que a pessoa escreveu na conversa. */
export function lerCaso(textoDaConversa: string): CasoTriagem {
  const t = textoDaConversa ?? "";
  const slots = extractSlots(t);

  const caso: CasoTriagem = {
    nacionalidade: slots.nacionalidade,
    ondeEsta: slots.ondeEsta,
    objetivo: slots.caminhos,
    prazo: slots.urgency,
    documentosBrasileiros: [],
  };

  caso.entrada = detectarEntrada(t);
  if (caso.entrada) caso.entradaRelato = slots.situacao;

  if (PASSAPORTE_NAO_TEM.test(t)) caso.passaporte = "nao_tem";
  else if (PASSAPORTE_VENCIDO.test(t)) caso.passaporte = "vencido";
  else if (PASSAPORTE_TEM.test(t)) caso.passaporte = "valido";

  // "não tenho certidão de nascimento" e "tenho a certidão" são fatos opostos, e o que
  // interessa ao advogado é justamente qual dos dois.
  if (CERTIDAO.test(t)) caso.certidaoNascimento = !frasePerto(t, CERTIDAO, NEGATIVA);
  if (ANTECEDENTES.test(t)) caso.antecedentes = !frasePerto(t, ANTECEDENTES, NEGATIVA);

  const vinculo = t.match(VINCULO)?.[0];
  if (vinculo) caso.vinculoFamiliar = vinculo.trim();

  for (const [re, nome] of DOCS_BR) {
    if (re.test(t) && !caso.documentosBrasileiros.includes(nome)) caso.documentosBrasileiros.push(nome);
  }

  for (const [re, rotulo] of DECISAO_NEGATIVA) {
    if (re.test(t)) { caso.decisaoNegativa = rotulo; break; }
  }

  if (RECUSA_PF.test(t)) caso.recusaPf = true;
  if (MENOR.test(t)) caso.menorEnvolvido = true;
  if (SEM_CONDICOES.test(t)) caso.semCondicoes = true;

  return caso;
}

/** A negação está na MESMA frase do termo? "Não tenho certidão" vs "tenho a certidão". */
function frasePerto(texto: string, termo: RegExp, negacao: RegExp): boolean {
  const frases = texto.split(/(?<=[.!?])\s+|\n+|\s{2,}/);
  const frase = frases.find((f) => termo.test(f));
  return frase ? negacao.test(frase) : false;
}

export function extractSlots(raw: string): TriagemSlots {
  const texto = raw ?? "";
  const slots: TriagemSlots = {};

  // Nome — as mesmas aberturas de sempre, que independem de domínio.
  const nameMatch = texto.match(
    /(?:meu nome (?:é|eh|e)|me chamo|sou (?:o|a)|aqui (?:é|eh|quem fala é)|my name is|mi nombre es|me llamo)\s+([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)?)/i,
  );
  if (nameMatch) {
    const connectors = new Set(["da", "de", "do", "das", "dos", "e", "na", "no", "a", "o"]);
    const parts = nameMatch[1].split(/\s+/).filter((w) => !connectors.has(w.toLowerCase()));
    if (parts.length) slots.name = titleCase(parts.slice(0, 2).join(" "));
  }

  const email = texto.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (email) slots.email = email[0].toLowerCase();

  const nacionalidade = detectarNacionalidade(texto);
  if (nacionalidade) slots.nacionalidade = nacionalidade;

  const ondeEsta = detectarOndeEsta(texto);
  if (ondeEsta) slots.ondeEsta = ondeEsta;

  const caminhos = detectarCaminhos(texto);
  if (caminhos.length) slots.caminhos = caminhos;

  const situacao = detectarSituacao(texto);
  if (situacao) slots.situacao = situacao;

  // Prazo. No atendimento de imigração, prazo quase sempre é prazo de PROCESSO (uma
  // exigência a responder, um documento vencendo) — por isso os sinais são outros.
  const t = texto.toLowerCase();
  if (
    /urgent|urg[êe]nc|imediat|o quanto antes|hoje|agora|amanh[ãa]|desesperad|socorro|prazo (?:est[áa] )?(?:correndo|vencendo|acabando)|vence (?:hoje|amanh[ãa]|essa semana)/.test(
      t,
    )
  ) {
    slots.urgency = "immediate";
  } else if (/essa semana|esta semana|pr[oó]xima semana|semana que vem|em (?:1|2|3) semanas|(?:1[05]|30) dias/.test(t)) {
    slots.urgency = "short";
  } else if (/pr[oó]ximo m[eê]s|m[eê]s que vem|em (?:1|2|3) mes|daqui a (?:um|dois|tr[êe]s) mes/.test(t)) {
    slots.urgency = "medium";
  } else if (/sem pressa|n[ãa]o tenho pressa|ano que vem|mais para frente|estou (?:s[óo] )?(?:planejando|pesquisando)|futuro/.test(t)) {
    slots.urgency = "long";
  }

  return slots;
}
