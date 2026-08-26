// O ATENDIMENTO SEM LLM.
//
// Substitui o motor determinístico herdado da base comercial — uma máquina de estados
// S0..S10 que abria um menu de terceirização ("1️⃣ Solicitar orçamento") para quem tinha
// acabado de perguntar sobre visto. Menu numerado é o oposto do que este atendimento
// precisa: quem chega com medo tem que poder contar a história com as próprias palavras.
//
// A regra que organiza o arquivo: este caminho NÃO informa sobre imigração. Ele não tem o
// material oficial na mão — o RAG entra no prompt do modelo, não aqui —, então qualquer
// frase de requisito, prazo ou documento seria invenção. O que ele faz é acolher, dizer o
// que a Imigrar Brasil faz (isso ele sabe: é informação da casa, não regra migratória),
// avançar a qualificação uma pergunta por vez e levar ao time jurídico assim que há caso.
//
// A PRIMEIRA VERSÃO DISTO TINHA UMA RESPOSTA SÓ e a repetia para sempre — inclusive logo
// depois de a pessoa ter respondido exatamente o que foi perguntado. É o pior desfecho
// possível num atendimento assim: quem está aflito lê a repetição como não estar sendo
// ouvido e some. Por isso o que decide a resposta aqui é o DOSSIÊ (o que já se sabe do
// contato, preenchido a cada turno por lib/agent/triagem.ts), e nunca um texto fixo.

import { getRepository } from "@/lib/data";
import { executeTool } from "@/lib/agent/tools";
import { detectTransfer } from "@/lib/agent/transfer";
import { findObjection } from "@/lib/agent/knowledge";
import { getTrainingConfig } from "@/lib/agent/system-prompt";
import { CASO_JURIDICO, EMERGENCIA, PEDIU_HUMANO } from "@/lib/agent/transfer-gate";
import { ehFechamentoCordial } from "@/lib/agent/anti-loop";
import { detectarOptOut, MENSAGEM_DESPEDIDA } from "@/lib/agent/opt-out";
import { idiomaDaConversa } from "@/lib/agent/idioma";
import { mensagemSemConteudo, lerCaso, type CasoTriagem } from "@/lib/agent/triagem";
import { semAcento } from "@/lib/agent/training";
import type { AgentTurn, ToolCallTrace, AgentRunResult } from "@/lib/agent/runner";

/**
 * Os idiomas que este caminho fala. Não é a lista do detector — é o que está escrito aqui
 * à mão. Fora deles a conversa sai em português; o modelo é que cobre o resto do mundo.
 *
 * Atender em espanhol não é luxo: a porta de entrada é bilíngue e seria absurdo cumprimentar
 * alguém em espanhol e continuar em português na frase seguinte.
 */
type Fala = "pt" | "es" | "en";

function falaDe(idioma?: string | null): Fala {
  return idioma === "es" || idioma === "en" ? idioma : "pt";
}

// A saudação vem do RELÓGIO DE BRASÍLIA, não da mensagem da pessoa. Metade de quem
// escreve está em outro fuso e manda "boa noite" às 9h da manhã daqui.
function saudacaoAgora(agora: Date): Record<Fala, string> {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(agora),
  );
  // O espanhol leva o ponto de exclamação de abertura — a saudação vai colada nele, então
  // ele mora aqui e não no template.
  //
  // A MADRUGADA É "BOA NOITE", não "bom dia". O corte ingênuo em `hora < 12` fazia a Ana
  // dar bom dia à 1h da manhã. Aqui isso não é detalhe de etiqueta: quem escreve de
  // madrugada costuma estar com medo justamente por isso, e a saudação errada é a primeira
  // coisa que entrega que do outro lado não tem ninguém lendo.
  if (hora < 5) return { pt: "Boa noite", es: "¡Buenas noches", en: "Good evening" };
  if (hora < 12) return { pt: "Bom dia", es: "¡Buenos días", en: "Good morning" };
  if (hora < 18) return { pt: "Boa tarde", es: "¡Buenas tardes", en: "Good afternoon" };
  return { pt: "Boa noite", es: "¡Buenas noches", en: "Good evening" };
}

// A porta de entrada é bilíngue PT/ES pela regra de ambiguidade do prompt: na primeira
// mensagem ainda não dá para saber o idioma de quem escreveu. E não se pede documento
// nenhum — pedir número de documento a quem chega com medo é exatamente o que este
// atendimento não faz.
function saudacao(agora: Date): string {
  const s = saudacaoAgora(agora);
  return (
    `${s.pt}! Aqui é a Ana, da Imigrar Brasil. A gente cuida de imigração para o Brasil: ` +
    `visto, regularização, naturalização, refúgio, Mercosul e reunião familiar. Me conta o ` +
    `que você precisa resolver que eu te ajudo.\n` +
    `${s.es}! Soy Ana, de Imigrar Brasil. Cuidamos de inmigración hacia Brasil: visa, ` +
    `regularización, naturalización, refugio, Mercosur y reunificación familiar. Cuéntame ` +
    `qué necesitas resolver.`
  );
}

/**
 * "O QUE VOCÊS FAZEM?" — a pergunta que este caminho PODE responder.
 *
 * Não é regra migratória: é o que a casa faz e o que ela não faz. Dizer isso não depende
 * de material oficial nenhum, e deixar a pergunta sem resposta (como acontecia) faz o
 * atendimento parecer quebrado logo na segunda mensagem.
 *
 * O que continua fora: COMO se faz cada caminho, o que apresentar, quanto tempo leva e
 * quanto custa. Isso é do material oficial ou do advogado.
 */
const O_QUE_FAZEMOS: Record<Fala, string> = {
  pt:
    "A Imigrar Brasil é uma assessoria jurídica especializada em imigração para o Brasil. " +
    "A gente cuida de visto solicitado no exterior, regularização de quem já está aqui, " +
    "naturalização, refúgio, residência pelo Mercosul e reunião familiar.\n\n" +
    "Quem analisa cada caso é o nosso time de advogados. Eu faço o primeiro atendimento: " +
    "entendo a sua situação e levo para eles. Me conta o que você precisa resolver?",
  es:
    "Imigrar Brasil es una asesoría jurídica especializada en inmigración hacia Brasil. " +
    "Nos ocupamos de visa solicitada en el exterior, regularización de quien ya está aquí, " +
    "naturalización, refugio, residencia por el Mercosur y reunificación familiar.\n\n" +
    "Quien analiza cada caso es nuestro equipo de abogados. Yo hago la primera atención: " +
    "entiendo tu situación y se la llevo a ellos. ¿Me cuentas qué necesitas resolver?",
  en:
    "Imigrar Brasil is a law practice specialised in immigration to Brazil. We handle visas " +
    "applied for abroad, regularisation for people already here, naturalisation, asylum, " +
    "Mercosur residence and family reunion.\n\n" +
    "Our lawyers are the ones who review each case. I do the first contact: I understand " +
    "your situation and take it to them. What do you need help with?",
};

const PERGUNTA_O_QUE_FAZEMOS =
  /\b(o que (voc[êe]s )?fazem|voc[êe]s fazem o qu[êe]|com o que voc[êe]s (trabalham|lidam|ajudam)|quais (os |s[ãa]o os )?servi[çc]os|em que voc[êe]s (podem )?ajudam?|quem (s[ãa]o )?voc[êe]s|sobre a (empresa|assessoria)|como funciona (o )?(atendimento|isso|voc[êe]s)|qu[ée] hacen|qu[ée] servicios|qui[ée]nes son|what do you (do|offer)|how does (it|this) work|who are you)\b/i;

/**
 * A QUALIFICAÇÃO, UMA PERGUNTA POR VEZ.
 *
 * A ordem é a que a conversa pede, não a do formulário: onde a pessoa está muda tudo
 * (quem está fora pede visto, quem está aqui regulariza), então vem primeiro. Nacionalidade
 * antes do prazo porque é o que o advogado usa para saber se há caminho pelo Mercosul.
 *
 * Cada entrada sabe DIZER a pergunta e RECONHECER se ela já foi feita — é isso que impede
 * o loop: se a resposta anterior já continha esta pergunta, passa para a próxima.
 */
type Passo = {
  /** Esta informação ainda falta? */
  falta: (c: CasoTriagem) => boolean;
  pergunta: Record<Fala, string>;
  /** Trecho estável da pergunta, para reconhecê-la no histórico em qualquer idioma. */
  marca: RegExp;
};

/**
 * AS 8 INFORMAÇÕES, na ordem de prioridade do prompt v2.
 *
 * A v1 perguntava quatro coisas e servia para INFORMAR. Estas oito servem para TRIAR: são
 * elas que dizem ao advogado qual é a via e quem precisa ser atendido hoje. As três do
 * meio — como entrou, que documento de origem tem, que vínculo tem no Brasil — são as que
 * mais mudam o desfecho, e eram exatamente as que ninguém perguntava.
 */
const PASSOS: Passo[] = [
  {
    falta: (c) => !c.nacionalidade,
    pergunta: {
      pt: "Para eu te ajudar direito: de qual país você é?",
      es: "Para ayudarte bien: ¿de qué país eres?",
      en: "So I can help you properly: which country are you from?",
    },
    marca: /de qual pa[íi]s voc[êe] [ée]|de qu[ée] pa[íi]s eres|which country are you from/i,
  },
  {
    falta: (c) => !c.ondeEsta,
    pergunta: {
      // UMA pergunta por mensagem vale para o ponto de interrogação também: "está no
      // Brasil? E se estiver fora, em qual país?" são duas, e é assim que a conversa
      // começa a parecer formulário.
      pt: "Você já está no Brasil ou ainda está fora — e, se estiver fora, em qual país?",
      es: "¿Ya estás en Brasil o todavía estás afuera — y, si estás afuera, en qué país?",
      en: "Are you already in Brazil or still abroad — and if abroad, in which country?",
    },
    marca: /j[áa] est[áa] no brasil ou ainda|ya est[áa]s en brasil|already in brazil/i,
  },
  {
    // Só faz sentido para quem já está aqui — e é a pergunta que mais muda o caso.
    falta: (c) => !!c.ondeEsta?.startsWith("Brasil") && !c.entrada,
    pergunta: {
      pt: "Quando você entrou no Brasil, passou pelo controle migratório — aeroporto ou posto de fronteira — ou entrou por outro caminho?",
      es: "Cuando entraste a Brasil, ¿pasaste por el control migratorio — aeropuerto o puesto de frontera — o entraste por otro camino?",
      en: "When you entered Brazil, did you go through immigration control — an airport or border post — or did you come in another way?",
    },
    marca: /passou pelo controle migrat[óo]rio|pasaste por el control migratorio|through immigration control/i,
  },
  {
    falta: (c) => c.passaporte === undefined,
    pergunta: {
      pt: "Você tem passaporte válido, certidão de nascimento e antecedentes criminais do seu país?",
      es: "¿Tienes pasaporte vigente, partida de nacimiento y antecedentes penales de tu país?",
      en: "Do you have a valid passport, a birth certificate and a criminal record check from your country?",
    },
    marca: /passaporte v[áa]lido|pasaporte vigente|valid passport/i,
  },
  {
    falta: (c) => !c.vinculoFamiliar,
    pergunta: {
      pt: "Você tem algum familiar brasileiro, ou que já tenha residência no Brasil?",
      es: "¿Tienes algún familiar brasileño, o que ya tenga residencia en Brasil?",
      en: "Do you have any family member who is Brazilian, or who already has residence in Brazil?",
    },
    marca: /familiar brasileir|familiar brasile[ñn]o|family member who is brazilian/i,
  },
  {
    falta: (c) => c.documentosBrasileiros.length === 0,
    pergunta: {
      pt: "Você já tem algum documento brasileiro? CRNM, protocolo, DPRNM ou CPF, por exemplo.",
      es: "¿Ya tienes algún documento brasileño? CRNM, protocolo, DPRNM o CPF, por ejemplo.",
      en: "Do you already have any Brazilian document? CRNM, a protocol number, DPRNM or CPF, for example.",
    },
    marca: /algum documento brasileiro|alg[úu]n documento brasile|any brazilian document/i,
  },
  {
    falta: (c) => !c.decisaoNegativa,
    pergunta: {
      pt: "Você chegou a receber alguma multa, notificação de saída ou decisão negativa?",
      es: "¿Llegaste a recibir alguna multa, notificación de salida o decisión negativa?",
      en: "Have you received any fine, notice to leave, or a negative decision?",
    },
    marca: /alguma multa, notifica[çc][ãa]o de sa[íi]da|alguna multa, notificaci[óo]n de salida|any fine, notice to leave/i,
  },
  {
    falta: (c) => !c.objetivo?.length || !c.prazo,
    pergunta: {
      pt: "E o que você quer conseguir, e em quanto tempo precisa disso?",
      es: "¿Y qué quieres conseguir, y en cuánto tiempo lo necesitas?",
      en: "And what are you trying to achieve, and by when do you need it?",
    },
    marca: /o que voc[êe] quer conseguir|qu[ée] quieres conseguir|what are you trying to achieve/i,
  },
];

/**
 * QUEM NÃO TEM COMO PAGAR RECEBE O ENDEREÇO CERTO.
 *
 * Não se insiste, não se tenta contornar, não se faz a pessoa se sentir mal. A Defensoria
 * Pública da União atende exatamente estes casos, de graça, e mandar a pessoa para lá é
 * atendê-la — não é dispensá-la.
 */
const DPU: Record<Fala, string> = {
  pt:
    "Obrigada por dizer, e isso não é motivo nenhum para constrangimento. Existe atendimento jurídico gratuito na Defensoria Pública da União, que cuida exatamente de casos de imigração: https://www.dpu.def.br/contatos-dpu\n\n" +
    "Dá para procurar por lá sem custo. Fico à disposição por aqui se precisar de qualquer outra coisa.",
  es:
    "Gracias por decirlo, y no es motivo alguno de vergüenza. Existe atención jurídica gratuita en la Defensoría Pública de la Unión, que atiende exactamente casos de inmigración: https://www.dpu.def.br/contatos-dpu\n\n" +
    "Puedes buscarlos sin costo. Quedo a disposición por aquí para cualquier otra cosa.",
  en:
    "Thank you for telling me — there's nothing to feel awkward about. There is free legal assistance at the Defensoria Pública da União, which handles immigration cases: https://www.dpu.def.br/contatos-dpu\n\n" +
    "You can go to them at no cost. I'm here if you need anything else.",
};

/**
 * ENCERRAMENTO COM CURIOSO. Duas perguntas seguidas sem resposta útil e a conversa é de
 * quem queria informação, não de quem tem caso. Insistir com essa pessoa é o que faz
 * alguém bloquear o número — e o custo de encerrar cedo demais é ela voltar a escrever,
 * que é barato.
 */
const ENCERRAR_CURIOSO: Record<Fala, string> = {
  pt:
    "Obrigada pelo contato! A Imigrar Brasil fica à disposição quando você tiver uma situação concreta para a gente analisar — é só chamar neste mesmo número.",
  es:
    "¡Gracias por el contacto! Imigrar Brasil queda a disposición cuando tengas una situación concreta para analizar — solo escribe a este mismo número.",
  en:
    "Thanks for reaching out! Imigrar Brasil is here whenever you have a specific situation for us to look at — just message this same number.",
};

/** Já se sabe tudo o que dá para saber sem ser interrogatório — a saída é oferecer o time. */
const OFERECER_TIME: Record<Fala, string> = {
  pt:
    "Já tenho o que preciso para o time jurídico olhar o seu caso com atenção. " +
    "Posso pedir para um advogado nosso falar com você?",
  es:
    "Ya tengo lo que necesito para que el equipo jurídico mire tu caso con atención. " +
    "¿Puedo pedirle a un abogado nuestro que hable contigo?",
  en:
    "I now have what our legal team needs to look at your case properly. " +
    "May I ask one of our lawyers to get in touch with you?",
};

const ENCAMINHOU: Record<Fala, string> = {
  pt: "Já deixei o seu caso com o nosso time jurídico — eles falam com você. Continuo por aqui se quiser me contar mais algum detalhe.",
  es: "Ya dejé tu caso con nuestro equipo jurídico — ellos hablan contigo. Sigo por aquí si quieres contarme algún detalle más.",
  en: "I've passed your case to our legal team — they'll be in touch. I'm still here if you want to tell me anything else.",
};

const CONFIDENCIAL: Record<Fala, string> = {
  pt: "Essa informação quem passa é o nosso time jurídico, não consigo te adiantar por aqui. Posso pedir para eles falarem com você?",
  es: "Esa información la da nuestro equipo jurídico, no puedo adelantártela por aquí. ¿Puedo pedirles que hablen contigo?",
  en: "That's information our legal team gives, I can't tell you here. May I ask them to get in touch?",
};

const RISCO: Record<Fala, string> = {
  pt: "Você não vai ficar sozinho nisso. Já estou pedindo para um advogado do nosso time falar com você agora.",
  es: "No vas a quedarte solo en esto. Ya estoy pidiendo que un abogado de nuestro equipo hable contigo ahora.",
  en: "You won't be left alone with this. I'm asking one of our lawyers to speak with you right now.",
};

const PEDIU_ADVOGADO: Record<Fala, string> = {
  pt: "Claro. Já passo o seu contato para o time jurídico dar sequência com você.",
  es: "Claro. Ya paso tu contacto al equipo jurídico para que sigan contigo.",
  en: "Of course. I'll pass your contact to the legal team so they can follow up with you.",
};

const CASO_CONCRETO: Record<Fala, string> = {
  pt: "Isso depende dos detalhes da sua situação, e quem consegue olhar isso é um advogado do nosso time.",
  es: "Eso depende de los detalles de tu situación, y quien puede mirarlo es un abogado de nuestro equipo.",
  en: "That depends on the details of your situation, and it's one of our lawyers who can look at it.",
};

/** Despedida curta. Quem já disse que era só isso não recebe mais uma pergunta. */
const DESPEDIDA: Record<Fala, string> = {
  pt: "Imagina, fico à disposição por aqui. Se precisar de qualquer coisa, é só chamar. 🙏",
  es: "De nada, quedo a disposición por aquí. Si necesitas cualquier cosa, solo escríbeme. 🙏",
  en: "Of course — I'm here whenever you need. Just message me any time. 🙏",
};

/**
 * PEDIDO DE CONTORNO. "Tem como dar um jeitinho?", "conheço quem faça por fora".
 *
 * O prompt tem a regra e o modelo a cumpre; este caminho não tinha nada, e respondia com
 * uma pergunta de triagem — que lido de fora parece que a proposta foi aceita. A resposta
 * não julga e não dá sermão: diz que não é caminho que a gente conduza e traz a conversa
 * de volta para o que dá para fazer.
 */
const CONTORNO =
  /\b(jeitinho|dar um jeito|por fora|por baixo|conhe[çc]o quem|tem como burlar|falsificar|documento falso|comprar (?:o |um )?(?:visto|documento)|casamento de fachada|casar (?:s[óo] )?para (?:conseguir|tirar)|subornar|propina|por debajo|arreglo|papeles falsos|matrimonio por conveniencia|fake document|forged|bribe|sham marriage)\b/i;

const SEM_CONTORNO: Record<Fala, string> = {
  pt:
    "Esse caminho não é uma opção que a gente conduza — e eu não ia te ajudar te colocando em risco. " +
    "O que dá para fazer é ver, com um advogado do time, qual caminho legal existe para o seu caso. Quer que eu peça para eles falarem com você?",
  es:
    "Ese camino no es una opción que nosotros llevemos — y no te ayudaría poniéndote en riesgo. " +
    "Lo que sí se puede es ver, con un abogado del equipo, qué camino legal existe para tu caso. ¿Quieres que les pida que hablen contigo?",
  en:
    "That's not a route we take — and it wouldn't help you to be put at risk. " +
    "What we can do is look, with one of our lawyers, at which lawful route fits your case. Would you like me to ask them to contact you?",
};

/**
 * DOCUMENTO MANDADO POR CONTA PRÓPRIA. A regra é não pedir — mas as pessoas mandam.
 * Quando mandam, o certo é agradecer, NÃO repetir o número na conversa e seguir.
 */
const DOCUMENTO_ENVIADO =
  /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|meu (?:cpf|rg|passaporte|protocolo) (?:e|é|:)|n[úu]mero do (?:meu )?(?:passaporte|protocolo))\b/i;

const NAO_PRECISA_DOCUMENTO: Record<Fala, string> = {
  pt:
    "Obrigada por confiar, mas não precisa me passar número de documento por aqui — quem cuida disso é o time jurídico, no momento certo. " +
    "Me conta o que você precisa resolver que eu levo o seu caso para eles.",
  es:
    "Gracias por la confianza, pero no hace falta pasarme número de documento por aquí — de eso se ocupa el equipo jurídico, en su momento. " +
    "Cuéntame qué necesitas resolver y les llevo tu caso.",
  en:
    "Thank you for trusting me, but there's no need to send document numbers here — the legal team handles that at the right time. " +
    "Tell me what you need to sort out and I'll take your case to them.",
};

/**
 * O QUE É CADA CAMINHO, EM UMA LINHA.
 *
 * O prompt autoriza explicitamente: "você PODE, sem material nenhum, explicar em uma frase
 * o que é cada caminho". O que ele proíbe é dizer COMO se faz, o que apresentar e quanto
 * tempo leva — e não há nada disso aqui.
 *
 * O glossário do painel (`training.technical.termos`) NÃO serve para isto: as definições de
 * lá vêm com instruções endereçadas ao modelo ("Explique assim, sem sigla solta", "Cite em
 * tom neutro"), que não podem ser enviadas a ninguém. Aqui o texto é o que a pessoa lê.
 */
const GLOSSARIO: Array<{ chave: RegExp; texto: Record<Fala, string> }> = [
  {
    chave: /\b(ref[uú]gio|refugiad|asilo|asylum|refugee)\b/i,
    texto: {
      pt: "Refúgio é a proteção que o Brasil dá a quem deixou o próprio país por perseguição, conflito ou grave violação de direitos humanos.",
      es: "El refugio es la protección que Brasil da a quien dejó su país por persecución, conflicto o grave violación de derechos humanos.",
      en: "Asylum is the protection Brazil gives to someone who left their country because of persecution, conflict or serious human rights violations.",
    },
  },
  {
    chave: /\b(reuni[ãa]o familiar|reunificaci[óo]n familiar|family reuni)/i,
    texto: {
      pt: "Reunião familiar é o caminho de quem quer trazer para perto ou manter no Brasil cônjuge, filhos, pais e outros familiares.",
      es: "La reunificación familiar es el camino de quien quiere traer o mantener en Brasil a cónyuge, hijos, padres y otros familiares.",
      en: "Family reunion is the route for bringing or keeping a spouse, children, parents or other family members in Brazil.",
    },
  },
  {
    chave: /\b(naturaliza[çc][ãa]o|naturalizaci[óo]n|naturalis|naturaliz)/i,
    texto: {
      pt: "Naturalização é o processo pelo qual quem é estrangeiro se torna brasileiro. É diferente de visto e de residência — são coisas separadas.",
      es: "La naturalización es el proceso por el cual una persona extranjera se vuelve brasileña. Es distinto de la visa y de la residencia.",
      en: "Naturalisation is how someone foreign becomes Brazilian. It's different from a visa and from residence — they're separate things.",
    },
  },
  {
    chave: /\b(mercosul|mercosur)\b/i,
    texto: {
      pt: "O acordo do Mercosul cria um caminho próprio de residência no Brasil para quem é nacional dos países do bloco.",
      es: "El acuerdo del Mercosur crea un camino propio de residencia en Brasil para nacionales de los países del bloque.",
      en: "The Mercosur agreement creates its own residence route in Brazil for nationals of the bloc's countries.",
    },
  },
  {
    chave: /\b(crnm|rnm)\b/i,
    texto: {
      pt: "A CRNM é a Carteira de Registro Nacional Migratório — o documento de identificação de quem é migrante e tem residência no Brasil.",
      es: "La CRNM es la Carteira de Registro Nacional Migratório — el documento de identificación de quien es migrante y tiene residencia en Brasil.",
      en: "The CRNM is the Carteira de Registro Nacional Migratório — the ID document for a migrant with residence in Brazil.",
    },
  },
  {
    chave: /\b(conare)\b/i,
    texto: {
      pt: "O CONARE é o comitê do governo brasileiro que analisa e decide os pedidos de refúgio.",
      es: "El CONARE es el comité del gobierno brasileño que analiza y decide las solicitudes de refugio.",
      en: "CONARE is the Brazilian government committee that reviews and decides asylum claims.",
    },
  },
  {
    chave: /\b(autoriza[çc][ãa]o de resid[êe]ncia|resid[êe]ncia|residencia|residence permit)\b/i,
    texto: {
      pt: "Autorização de residência é a permissão para morar no Brasil. Ela existe por vários motivos diferentes — trabalho, família, estudo, Mercosul — e qual cabe em cada caso é análise do time jurídico.",
      es: "La autorización de residencia es el permiso para vivir en Brasil. Existe por varios motivos — trabajo, familia, estudio, Mercosur — y cuál cabe en cada caso lo analiza el equipo jurídico.",
      en: "A residence permit is the permission to live in Brazil. It exists for several different reasons — work, family, study, Mercosur — and which one fits is for the legal team to assess.",
    },
  },
];

const PERGUNTA_DEFINICAO =
  /\b(o que (?:é|e|significa|seria)|que (?:é|e) (?:o |a )?|qu[ée] es|qu[ée] significa|what is|what's|what does .{2,30} mean|como funciona (?:o |a )?(?:ref[uú]gio|reuni|naturaliza|mercosu|crnm|resid))\b/i;

/** A explicação de um caminho, quando a pessoa perguntou o que ele é. */
function explicacaoDe(texto: string, fala: Fala): string | undefined {
  if (!PERGUNTA_DEFINICAO.test(texto)) return undefined;
  const alvo = semAcento(texto);
  return GLOSSARIO.find((g) => g.chave.test(alvo) || g.chave.test(texto))?.texto[fala];
}

/**
 * O reconvite, quando a mensagem não tem conteúdo ("oi", "sim", "ta", "?????").
 *
 * Sem isto, cada uma dessas avançava a lista de qualificação, e três cumprimentos
 * seguidos viravam três perguntas de cadastro enfileiradas: exatamente o interrogatório
 * que o prompt proíbe, com alguém que ainda não disse nada.
 *
 * São DOIS degraus, e depois deles a conversa encerra (ENCERRAR_CURIOSO). Contando a
 * saudação, são quatro mensagens no total — o limite que a v2 fixou para quem não
 * responde. Insistir além disso é o que faz alguém bloquear o número.
 */
const RECONVITE: Record<Fala, string>[] = [
  {
    pt: "Estou por aqui 🙂 Me conta com as suas palavras o que você precisa resolver — pode ser só o começo da história.",
    es: "Estoy por aquí 🙂 Cuéntame con tus palabras qué necesitas resolver — puede ser solo el principio de la historia.",
    en: "I'm here 🙂 Tell me in your own words what you need to sort out — even just the start of it.",
  },
  {
    pt: "Fica à vontade para me escrever quando quiser. Se preferir falar direto com uma pessoa do time, é só me dizer.",
    es: "Escríbeme cuando quieras, sin problema. Si prefieres hablar directo con alguien del equipo, solo dímelo.",
    en: "Write whenever you're ready. If you'd rather speak to someone from the team directly, just say so.",
  },
];

/**
 * PEDIDO DE LISTA DE DOCUMENTOS, REQUISITO OU PRAZO — o que este caminho NÃO tem.
 *
 * É a pergunta mais comum de todas, e a que mais tenta o agente a inventar. Sem o material
 * oficial na mão, a resposta honesta não é uma pergunta de cadastro (que foi o que ela
 * recebia): é dizer que essa informação depende do caso e quem confirma é o time.
 */
const PEDE_PROCEDIMENTO =
  /\b(quais|que|qual)\s+(?:s[ãa]o\s+)?(?:os\s+|as\s+|o\s+|a\s+)?(documento|papel|papeis|pap[ée]is|requisito|exig[êe]ncia|taxa|formul[áa]rio|passo)|\b(lista de documentos|o que (?:eu )?preciso (?:levar|apresentar|ter)|preciso de quais|qu[ée] documentos|what documents|which documents|documentos necesito|requisitos)\b/i;

const NAO_TENHO_ESSA: Record<Fala, string> = {
  pt: "Essa lista muda conforme o caso — o vínculo, como você entrou, o documento que você tem hoje. Quem monta isso direito é o advogado.",
  es: "Esa lista cambia según el caso — el vínculo, cómo entraste, el documento que tienes hoy. Quien lo arma bien es el abogado.",
  en: "That list changes with the case — the relationship, how you entered, the document you hold today. It's the lawyer who puts it together properly.",
};

/**
 * A INSISTÊNCIA. "Só me diz quais documentos", "me manda a lista".
 *
 * A postura não se dobra por insistência, mas o tom não endurece. A segunda resposta diz o
 * PORQUÊ — passar metade da lista faria a pessoa se planejar em cima de informação errada
 * — e volta para a pergunta que faltava.
 */
const INSISTE_NO_PROCEDIMENTO =
  /\b(s[óo] me diz|so me diz|me diz s[óo]|me manda a lista|manda a lista|me passa a lista|por favor,? (?:me )?(?:diz|fala|manda)|s[óo] (?:uma )?ideia|pelo menos|ao menos|d[áa] para adiantar|s[óo]lo dime|dime nada m[áa]s|just tell me|at least tell)\b/i;

const AINDA_ASSIM_NAO: Record<Fala, string> = {
  pt: "Eu entendo, de verdade — e é justamente por isso que não passo pela metade: você ia se organizar em cima de uma informação que pode não valer para o seu caso, e aí o prejuízo é seu.",
  es: "Te entiendo de verdad — y justo por eso no la paso a medias: te organizarías con base en una información que puede no valer para tu caso, y el perjuicio sería tuyo.",
  en: "I do understand — and that's exactly why I won't give you half of it: you'd plan around something that may not apply to your case, and you'd be the one paying for it.",
};

function isConfidentialAsk(text: string, termos: string[]): boolean {
  const t = text.toLowerCase();
  return termos.some((term) => t.includes(term.toLowerCase()));
}

/**
 * Núcleo determinístico do agente. Roda sem chave de API nenhuma e nunca deixa o
 * atendimento sem resposta. Devolve { reply, toolCalls } — quem grava as mensagens e
 * calcula o status é o respondToConversation().
 */
export async function runFallback({
  history,
  conversationId,
}: {
  history: AgentTurn[];
  conversationId: string;
}): Promise<AgentRunResult> {
  const repo = getRepository();
  const toolCalls: ToolCallTrace[] = [];
  const lastRaw = history[history.length - 1]?.content ?? "";
  const allUserText = history
    .filter((h) => h.role === "user")
    .map((h) => h.content)
    .join("  ");
  const mensagensDaPessoa = history.filter((h) => h.role === "user").map((h) => h.content);
  const jaDisseAlgo = history.filter((h) => h.role === "assistant").map((h) => h.content);
  const primeiraMensagem = jaDisseAlgo.length === 0;

  // O CASO, lido da conversa inteira a cada turno. É ele que decide qual das 8 perguntas
  // vem agora — e não uma posição guardada em lugar nenhum, que sairia de sincronia com o
  // que a pessoa já contou.
  const caso = lerCaso(allUserText);
  const semNovidade = turnosSemNovidade(mensagensDaPessoa);

  // O idioma já gravado no contato é a rede para quando a mensagem de agora for curta
  // demais para identificar ("ok", "sim") — quem escreveu quatro mensagens em espanhol
  // continua sendo atendido em espanhol.
  const conv = await repo.getConversation(conversationId).catch(() => null);
  const fala = falaDe(idiomaDaConversa(lastRaw, allUserText, conv?.idioma));

  // Objeções, guardrails e regras de encaminhamento vêm do painel (/dashboard/treinar).
  // Uma leitura por turno: o caminho sem LLM responde com o que a equipe editou, e não
  // com a lista congelada no código.
  const training = await getTrainingConfig();

  // A explicação do caminho, quando a pessoa perguntou "o que é X". Vem antes de tudo
  // porque ela precisa ir JUNTO com o encaminhamento: quem pergunta "o que é refúgio?"
  // dispara a regra de transbordo (tema sensível) e, sem isto, recebia só um "isso depende
  // dos detalhes da sua situação" — que não responde nada do que foi perguntado.
  const explicacao = explicacaoDe(lastRaw, fala);

  const encaminhar = async (reason: string, resposta: string): Promise<AgentRunResult> => {
    const texto = explicacao ? `${explicacao}\n\n${resposta}` : resposta;
    const input = {
      conversation_id: conversationId,
      reason,
      summary: allUserText.slice(0, 400),
      setor: "comercial" as const,
      priority: EMERGENCIA.test(lastRaw) ? ("urgent" as const) : ("normal" as const),
    };
    const result = await executeTool("transferir_para_humano", input).catch((err) => ({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }));
    toolCalls.push({ name: "transferir_para_humano", input, result });
    // A tool tem portão próprio (transfer-gate): se ela segurou, ninguém foi chamado e
    // dizer que foi seria deixar uma pessoa aflita esperando um retorno que não existe.
    const passou = (result as { ok?: boolean })?.ok !== false;
    if (passou) return { reply: `${texto}\n\n${ENCAMINHOU[fala]}`, toolCalls };
    // O portão segurou: ninguém foi chamado, então a conversa continua aqui. Mas UMA
    // PERGUNTA POR VEZ — se a resposta já termina perguntando ("quer que eu peça para
    // eles falarem com você?"), emendar a pergunta da triagem manda duas de uma vez, que
    // é exatamente o que faz a conversa parecer formulário.
    if (texto.trim().endsWith("?")) return { reply: texto, toolCalls };
    return { reply: `${texto}\n\n${proximaPergunta(caso, fala, jaDisseAlgo)}`, toolCalls };
  };

  // ─── 1) NÃO TEM COMO PAGAR ───
  // Antes de qualquer triagem. Continuar perguntando a quem já disse que não pode pagar é
  // levantar dados de alguém que a gente não vai atender — e ela precisa do endereço certo
  // agora, não no fim do questionário.
  if (caso.semCondicoes) return { reply: DPU[fala], toolCalls };

  // ─── 2) GUARDRAIL: honorários e o que mais a equipe marcou como confidencial ───
  if (isConfidentialAsk(lastRaw, training.guardrails.termos)) {
    return encaminhar("honorarios_e_contratacao", CONFIDENCIAL[fala]);
  }

  // ─── 2) PEDIU PARA PARAR ───
  // Na produção quem silencia o número é o webhook, ANTES de enviar. Mas a resposta ainda
  // era gerada aqui — e era mais uma pergunta de cadastro. Se um dia o envio escapar, o
  // que sai tem que ser a despedida, não a insistência que gera a denúncia.
  if (detectarOptOut(lastRaw) === "bloquear") {
    return { reply: MENSAGEM_DESPEDIDA, toolCalls };
  }

  // ─── 3) RISCO À PESSOA — na frente de tudo, e sem esperar confirmação ───
  if (EMERGENCIA.test(lastRaw)) return encaminhar("urgencia_ou_aflicao", RISCO[fala]);

  // ─── 3) A pessoa pediu um humano / um advogado ───
  if (PEDIU_HUMANO.test(lastRaw)) return encaminhar("advogado_ou_juridico", PEDIU_ADVOGADO[fala]);

  // ─── 4) Ela está se despedindo ───
  // Antes de qualquer pergunta: quem disse "era só isso mesmo, muito obrigado" e recebe
  // mais uma pergunta de cadastro fica com a impressão certa de não ter sido lido.
  if (!primeiraMensagem && ehFechamentoCordial(lastRaw)) {
    return { reply: DESPEDIDA[fala], toolCalls };
  }

  // ─── 5) Pedido de contorno ───
  if (CONTORNO.test(lastRaw)) return encaminhar("pedido_de_analise", SEM_CONTORNO[fala]);

  // ─── 6) Regra de encaminhamento do painel (processo, irregularidade, refúgio…) ───
  const transfer = detectTransfer(lastRaw, training.transferRules);
  if (transfer) return encaminhar(transfer.categoria, transfer.resposta);

  // ─── 7) Sinal de caso concreto que as regras editadas possam não cobrir ───
  if (CASO_JURIDICO.test(lastRaw)) return encaminhar("pedido_de_analise", CASO_CONCRETO[fala]);

  // ─── 8) Preocupação frequente cadastrada no painel ───
  if (!primeiraMensagem) {
    const obj = findObjection(
      lastRaw,
      training.objections.filter((o) => o.ativo),
    );
    if (obj) return { reply: obj.resposta, toolCalls };
  }

  // ─── 9) Porta de entrada ───
  if (primeiraMensagem) return { reply: saudacao(new Date()), toolCalls };

  // ─── 10) Mandou documento por conta própria ───
  if (DOCUMENTO_ENVIADO.test(lastRaw)) return { reply: NAO_PRECISA_DOCUMENTO[fala], toolCalls };

  // ─── 11) "O que vocês fazem?" — o que ELE PODE responder ───
  // Vem depois dos gatilhos de transbordo de propósito: quem pergunta "o que vocês fazem"
  // no meio de um caso concreto precisa do advogado, não do institucional.
  if (PERGUNTA_O_QUE_FAZEMOS.test(lastRaw)) {
    return { reply: O_QUE_FAZEMOS[fala], toolCalls };
  }

  // ─── 12) "O que é refúgio?" — UMA frase e devolve a pergunta ───
  // É a postura da v2: responde curto e volta para a situação específica dela. Nunca a
  // explicação sozinha, que transformaria o atendimento numa aula.
  if (explicacao) {
    return { reply: `${explicacao}\n\n${proximaPergunta(caso, fala, jaDisseAlgo)}`, toolCalls };
  }

  // ─── 13) Pediu documento, requisito ou prazo — não entrega, e devolve a pergunta ───
  // "Não tenho essa informação" é resposta COMPLETA aqui. Entregar lista ou passo a passo é
  // trabalho do advogado; inventar é o único erro grave que existe neste atendimento.
  if (PEDE_PROCEDIMENTO.test(lastRaw) || INSISTE_NO_PROCEDIMENTO.test(lastRaw)) {
    const jaRecusou = jaDisseAlgo.some((d) => d.includes(NAO_TENHO_ESSA[fala].slice(0, 30)));
    const jaExplicou = jaDisseAlgo.some((d) => d.includes(AINDA_ASSIM_NAO[fala].slice(0, 30)));
    // TERCEIRA INSISTÊNCIA: ela já ouviu a recusa e o porquê, e não respondeu nenhuma das
    // perguntas no meio. É a regra da v2 — quem não responde duas perguntas seguidas quer
    // informação, não atendimento. Repetir uma terceira vez só faz a rede anti-repetição
    // disparar e a Ana pedir desculpa por um impasse que não é dela.
    if (jaExplicou) return { reply: ENCERRAR_CURIOSO[fala], toolCalls };
    // Se ela já ouviu a recusa uma vez e insistiu, a segunda diz o PORQUÊ — sem endurecer.
    const texto = jaRecusou ? AINDA_ASSIM_NAO[fala] : NAO_TENHO_ESSA[fala];
    return { reply: `${texto}\n\n${proximaPergunta(caso, fala, jaDisseAlgo)}`, toolCalls };
  }

  // ─── 14) Mensagem sem conteúdo: reconvida e, se persistir, ENCERRA ───
  // "Se a pessoa não responder duas perguntas seguidas, ela provavelmente só quer
  // informação. Encerre com cortesia." Dois reconvites e o encerramento: quatro mensagens
  // no total, contando a saudação.
  if (mensagemSemConteudo(lastRaw)) {
    const jaReconvidou = RECONVITE.filter((r) =>
      jaDisseAlgo.some((d) => d.includes(r[fala].slice(0, 28))),
    ).length;
    if (jaReconvidou >= RECONVITE.length) return { reply: ENCERRAR_CURIOSO[fala], toolCalls };
    return { reply: RECONVITE[jaReconvidou][fala], toolCalls };
  }

  // ─── 15) Duas respostas seguidas sem nada de caso — é curioso, não atendimento ───
  // Vale para quem responde frases inteiras que não dizem nada do caso ("tá, entendi",
  // "legal, e aí?"). Insistir com essa pessoa é o que faz alguém bloquear o número.
  const jaEncerrou = jaDisseAlgo.some((d) => d.includes(ENCERRAR_CURIOSO[fala].slice(0, 30)));
  if (semNovidade >= 2 && jaDisseAlgo.length >= 2 && !jaEncerrou) {
    return { reply: ENCERRAR_CURIOSO[fala], toolCalls };
  }

  // ─── 16) A próxima coisa que ainda não se sabe ───
  return { reply: proximaPergunta(caso, fala, jaDisseAlgo), toolCalls };
}

/**
 * A próxima pergunta que faz sentido — a primeira que ainda não foi respondida E ainda não
 * foi feita. É o que impede a repetição: se a pessoa respondeu algo que a heurística não
 * conseguiu ler, a pergunta não volta; a conversa segue para a seguinte.
 */
function proximaPergunta(caso: CasoTriagem, fala: Fala, jaDisseAlgo: string[]): string {
  const jaPerguntou = (p: Passo) => jaDisseAlgo.some((r) => p.marca.test(r));
  const nova = PASSOS.filter((p) => p.falta(caso)).find((p) => !jaPerguntou(p));
  if (nova) return nova.pergunta[fala];

  // Ou não falta nada, ou tudo o que falta já foi perguntado uma vez e não veio resposta
  // legível. Nos dois casos insistir é que seria o erro: quem decide daqui é uma pessoa.
  return OFERECER_TIME[fala];
}

/**
 * Quantas mensagens seguidas da pessoa não acrescentaram NADA ao caso.
 *
 * É como o "não respondeu duas perguntas seguidas" do prompt vira número. A conta é feita
 * relendo o caso a cada prefixo da conversa: se ler as N primeiras mensagens dá o mesmo
 * caso que ler as N-1, aquela mensagem não trouxe nada. Não depende de guardar estado, e
 * por isso não sai de sincronia quando a pessoa responde três coisas de uma vez.
 */
function turnosSemNovidade(mensagensDaPessoa: string[]): number {
  const assinatura = (t: string) => JSON.stringify(lerCaso(t));
  let contagem = 0;
  for (let i = mensagensDaPessoa.length; i > 0; i--) {
    const ate = mensagensDaPessoa.slice(0, i).join("  ");
    const antes = mensagensDaPessoa.slice(0, i - 1).join("  ");
    if (assinatura(ate) !== assinatura(antes)) break;
    contagem++;
  }
  return contagem;
}
