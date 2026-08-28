// Nomes dos idiomas, em português. Fica no domínio, e não em lib/agent/idioma.ts, para
// que o PAINEL possa usar: aquele módulo importa o repositório, e arrastar a camada de
// dados para dentro do bundle do cliente por causa de uma tabela de rótulos seria caro.
//
// POR QUE A TABELA É MAIOR DO QUE OS IDIOMAS QUE A HEURÍSTICA DETECTA. Ela era do tamanho
// exato do detector escrito à mão — o que fazia sentido enquanto ele era a única fonte de
// idioma. Com `lib/agent/idioma-modelo.ts` como última instância, o código gravado no
// contato pode ser QUALQUER um: o modelo reconhece a língua que a heurística nunca viu.
// Quando falta o nome, dois lugares pioram na hora — o chip da fila mostra "sw" em vez de
// "suaíli", e o prompt do follow-up manda escrever "EM SW". Por isso a lista cobre bem
// mais do que a operação vê hoje: é tabela de rótulos, não de idiomas suportados.
export const NOME_DO_IDIOMA: Record<string, string> = {
  // ── as línguas do atendimento, as que aparecem todo dia
  pt: "português", es: "espanhol", en: "inglês", fr: "francês", ht: "crioulo haitiano",

  // ── Américas e Europa
  it: "italiano", de: "alemão", nl: "holandês", ro: "romeno", pl: "polonês",
  ca: "catalão", gl: "galego", el: "grego", sv: "sueco", no: "norueguês",
  da: "dinamarquês", fi: "finlandês", is: "islandês", ga: "irlandês", eu: "basco",
  cs: "tcheco", sk: "eslovaco", hu: "húngaro", bg: "búlgaro", sr: "sérvio",
  hr: "croata", bs: "bósnio", sl: "esloveno", mk: "macedônio", sq: "albanês",
  et: "estoniano", lv: "letão", lt: "lituano", ru: "russo", uk: "ucraniano",
  be: "bielorrusso",

  // ── Oriente Médio, Cáucaso e Ásia Central
  ar: "árabe", he: "hebraico", tr: "turco", fa: "persa", ku: "curdo",
  hy: "armênio", ka: "georgiano", az: "azeri", kk: "cazaque", uz: "uzbeque",
  tg: "tadjique", ky: "quirguiz", mn: "mongol", ps: "pashto",

  // ── Sul e Sudeste Asiático
  hi: "híndi", bn: "bengali", ur: "urdu", pa: "punjabi", gu: "guzerate",
  mr: "marata", ta: "tâmil", te: "télugo", kn: "canarim", ml: "malaiala",
  si: "cingalês", ne: "nepali", my: "birmanês", th: "tailandês", lo: "laosiano",
  km: "khmer", vi: "vietnamita", id: "indonésio", ms: "malaio", tl: "tagalo",
  zh: "chinês", ja: "japonês", ko: "coreano",

  // ── África
  sw: "suaíli", wo: "wolof", ln: "lingala", ff: "fula", bm: "bambara",
  ha: "hauçá", yo: "iorubá", ig: "igbo", ak: "twi", ee: "ewe",
  am: "amárico", ti: "tigrínio", om: "oromo", so: "somali", rw: "quiniaruanda",
  rn: "quirundi", lg: "luganda", ny: "chichewa", sn: "chona", zu: "zulu",
  xh: "xhosa", st: "sesoto", af: "africâner", mg: "malgaxe",
};

/** Rótulo legível de um código ISO-639-1, com o próprio código como último recurso. */
export function nomeDoIdioma(codigo?: string | null): string | null {
  if (!codigo) return null;
  return NOME_DO_IDIOMA[codigo] ?? codigo;
}
