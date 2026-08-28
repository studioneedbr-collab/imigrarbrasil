// O VERIFICADOR DE SAÍDA — a última leitura antes de a mensagem sair.
//
// O prompt já proíbe a Ana de analisar o caso concreto de alguém. Proibir no prompt
// resolve a maioria das vezes e falha exatamente onde dói: numa conversa real ela
// escreveu, em espanhol, que ter o passaporte carimbado em Pacaraima "es buena señal:
// significa que tu entrada quedó registrada de forma regular". Isso é um parecer. Um
// escritório de advocacia acabou de dizer a uma pessoa que a entrada dela é regular —
// e se estiver errado, ela vai tomar decisão de vida em cima disso.
//
// QUALIFICAR NÃO É REGISTRAR. A Ana pode dizer o FATO ("você entrou por Pacaraima e teve
// o passaporte carimbado") e seguir com a próxima pergunta. O que ela não pode é dizer
// se esse fato é bom, ruim, regular, irregular, favorável ou tranquilo. Quem avalia é o
// advogado, depois de ver o caso inteiro.
//
// O CORTE É POR FRASE, e é de propósito: apagar a mensagem inteira transformaria um
// deslize numa conversa quebrada, e reescrever no idioma errado seria pior ainda. A
// frase que qualifica sai, o resto da mensagem continua de pé. Só quando NADA sobra é
// que entra um acolhimento neutro — e ele existe nos idiomas em que este atendimento
// realmente acontece.

/** O que a revisão devolve: o texto já limpo e o que foi tirado (vai para o log). */
export interface RevisaoDeSaida {
  texto: string;
  /** As frases removidas, na ordem em que apareciam. Vazio quando nada foi cortado. */
  cortes: string[];
}

/**
 * As frases que QUALIFICAM a situação da pessoa.
 *
 * Cada padrão exige um verbo de ligação (ou equivalente) junto do adjetivo: é isso que
 * separa "sua entrada está regular" — parecer — de "regularização migratória", que é o
 * nome de um serviço e aparece o tempo todo numa conversa legítima. Sem essa exigência o
 * verificador cortaria metade das mensagens boas, e um verificador que corta demais é
 * desligado na primeira semana.
 *
 * O texto chega normalizado (minúsculas, sem acento) — ver `normalizar`.
 */
const QUALIFICACOES: RegExp[] = [
  // ── "é um bom sinal" / "es buena señal" / "is a good sign" / "c'est bon signe"
  /\b(e|esta|estava|ficou|foi|parece|seria|sera|era|sao|e um|e uma)\s+(um |uma )?(bom|boa|mau|ma|otimo|otima|pessimo|pessima)\s+(sinal|noticia|indicio|presagio)\b/,
  /\b(es|esta|estaba|fue|era|parece|seria|sera)\s+(un |una )?(buen|buena|mal|mala|excelente|pesima)\s+(senal|senial|noticia|indicio)\b/,
  /\b(is|was|seems|looks like|sounds like)\s+(a )?(good|bad|great|terrible)\s+(sign|news|thing)\b/,
  /\b(c'est|est)\s+(un |une )?(bon|bonne|mauvais|mauvaise)\s+(signe|nouvelle)\b/,

  // ── "sua situação/entrada/estadia está regular|irregular|em ordem|tranquila…"
  /\b(sua|tua|a sua|a tua|seu|teu|o seu|o teu)\s+\w+(\s+\w+)?\s+(esta|e|ficou|foi|era|continua|permanece)\s+(regular|irregular|em ordem|em dia|tranquil[oa]|favoravel|desfavoravel|complicad[oa]|dificil|boa|bom|ruim|segur[oa]|arriscad[oa]|legal|ilegal|valid[oa])\b/,
  /\b(tu|su|la tu|el tu)\s+\w+(\s+\w+)?\s+(esta|es|quedo|fue|era|sigue|continua)\s+(regular|irregular|en regla|en orden|tranquil[oa]|favorable|desfavorable|complicad[oa]|dificil|buena|bueno|mala|segur[oa]|legal|ilegal|valid[oa])\b/,
  /\byour\s+\w+(\s+\w+)?\s+(is|was|looks|seems|remains)\s+(regular|irregular|in order|fine|ok|okay|good|bad|safe|legal|illegal|valid)\b/,

  // ── "ficou registrada de forma regular" / "quedó registrada de manera regular"
  /\bde\s+(forma|maneira|manera|modo)\s+(regular|irregular|legal|ilegal|correta|correcta|adequada)\b/,
  /\b(entrou|entrada|ingresso|ingreso|entraste|entro)\b[^.!?]{0,40}\b(regular|irregular|legal|ilegal)\b/,

  // ── "está tudo certo/em ordem" / "está todo bien" / "everything is fine"
  /\b(esta|ficou|foi|e)\s+(tudo\s+)?(certo|em ordem|em dia|regularizad[oa]|resolvid[oa])\b/,
  /\b(esta|quedo|fue)\s+(todo\s+)?(bien|en regla|en orden|resuelto|regularizado)\b/,
  /\b(everything|it)\s+(is|was|looks|seems)\s+(fine|ok|okay|in order|sorted|good)\b/,

  // ── "isso pesa a seu favor" / "eso juega a tu favor" / "that works in your favour"
  /\b(a|ao|no)\s+(seu|teu)\s+favor\b/,
  /\b(a|en)\s+(tu|su)\s+favor\b/,
  /\bin your favou?r\b/,

  // ── "isso ajuda/facilita/complica o seu caso" — parecer sobre o desfecho
  /\b(ajuda|facilita|complica|atrapalha|dificulta|melhora|piora|fortalece|enfraquece)\s+(muito\s+)?(o\s+|a\s+)?(seu|teu|sua|tua)\s+(caso|pedido|processo|situacao)\b/,
  /\b(ayuda|facilita|complica|dificulta|mejora|empeora|fortalece)\s+(mucho\s+)?(tu|su)\s+(caso|pedido|proceso|situacion)\b/,

  // ── "você está regular/irregular" dito na cara — o mais direto de todos
  /\b(voce|vc|tu)\s+(esta|ta|estas|continua|permanece)\s+(regular|irregular|em situacao regular|em situacao irregular|legal|ilegal)\b/,
  /\b(estas|estan|estais)\s+(en situacion\s+)?(regular|irregular|legal|ilegal)\b/,
];

/** Minúsculas e sem acento: a mensagem sai no idioma da pessoa e chega escrita de todo jeito. */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Quebra o texto em frases PRESERVANDO a pontuação e as quebras de linha.
 *
 * Juntar os pedaços de volta tem que devolver exatamente o texto original — é o que
 * garante que, quando nada é cortado, a mensagem sai byte a byte como o modelo escreveu.
 */
export function emFrases(texto: string): string[] {
  const partes = texto.match(/[^.!?\n]+[.!?]*\n*|\n+/g);
  return partes ?? (texto ? [texto] : []);
}

/** A frase qualifica a situação da pessoa? */
export function qualificaSituacao(frase: string): boolean {
  const t = normalizar(frase);
  return QUALIFICACOES.some((re) => re.test(t));
}

/**
 * O acolhimento neutro, para o caso raro em que a mensagem inteira era parecer.
 *
 * Não informa nada e não avalia nada: registra que a Ana leu e devolve a conversa para
 * quem entende do assunto. Nos idiomas que este atendimento realmente vê — mandar isto
 * em português para quem escreveu em espanhol seria trocar um erro por outro.
 */
const NEUTRO: Record<string, string> = {
  pt: "Entendi, anotei isso aqui. Quem consegue avaliar o que isso significa no seu caso é o time jurídico — posso pedir para eles falarem com você?",
  es: "Entendido, ya lo anoté. Quien puede evaluar lo que eso significa en tu caso es el equipo jurídico — ¿puedo pedirles que hablen contigo?",
  en: "Got it, I've noted that. The legal team is who can assess what it means for your case — may I ask them to get in touch with you?",
  fr: "C'est noté. C'est l'équipe juridique qui peut évaluer ce que cela signifie dans votre cas — puis-je leur demander de vous contacter ?",
};

export function acolhimentoNeutro(idioma?: string | null): string {
  return NEUTRO[idioma ?? "pt"] ?? NEUTRO.pt;
}

/**
 * Passa a resposta pelo verificador. Devolve o texto que pode sair e o que foi cortado.
 *
 * `idioma` só é usado no caso extremo em que a mensagem inteira some.
 */
export function revisarSaida(resposta: string, idioma?: string | null): RevisaoDeSaida {
  const texto = resposta ?? "";
  if (!texto.trim()) return { texto, cortes: [] };

  const frases = emFrases(texto);
  const cortes: string[] = [];
  const mantidas = frases.filter((f) => {
    if (!f.trim()) return true; // quebras de linha soltas não são frase
    if (qualificaSituacao(f)) {
      cortes.push(f.trim());
      return false;
    }
    return true;
  });

  if (!cortes.length) return { texto, cortes: [] };

  const limpo = mantidas.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { texto: limpo || acolhimentoNeutro(idioma), cortes };
}

// ─── "JÁ PASSEI PARA O TIME" SEM TER PASSADO ───
//
// O prompt já diz: só afirme que encaminhou na mensagem em que você REALMENTE chamou
// transferir_para_humano. É a regra mais fácil de quebrar sem perceber, porque a frase é
// gentil e cabe em qualquer lugar — e é a que custa mais caro. Quem lê "já passei o seu
// caso" para de procurar ajuda e fica esperando um telefonema que ninguém agendou. Se
// havia prazo correndo, ela espera enquanto o prazo passa.
//
// O portão de encaminhamento recusa a transferência em várias situações (ficha vazia,
// confirmação pendente) e devolve `ok: false`. O modelo, nesses casos, costuma escrever
// a mensagem de despedida do mesmo jeito — ele não distingue "chamei a tool" de "a tool
// deu certo". Aqui a frase é cortada quando nenhum encaminhamento aconteceu de verdade.

const ANUNCIA_ENCAMINHAMENTO: RegExp[] = [
  /\b(ja|acabei de|acabo de)\s+(passei|passo|encaminhei|deixei|repassei|mandei|pedi)\b[^.!?]{0,60}\b(time|equipe|juridico|advogad|especialista|setor)/,
  /\b(passei|encaminhei|deixei|repassei)\s+(o\s+)?(seu|teu)\s+(caso|contato|numero)\b/,
  /\b(ya\s+)?(pase|pasé|deje|dejé|derive|derivé|envie|envié)\s+(tu|su)\s+(caso|contacto|numero)\b/,
  /\b(ya|acabo de)\s+(pasar|pase|pasé|derivar|derive|derivé)\b[^.!?]{0,60}\b(equipo|juridico|abogad|especialista)/,
  /\b(i('ve| have)?\s+)?(passed|forwarded|handed|sent)\s+(your|the)\s+(case|details|contact)\b/,
  /\b(o|a)\s+(time|equipe)\s+(juridico|jur[ií]dica)?\s*(ja\s+)?(vai|ira|entra)\s+(entrar\s+)?em\s+contato\b/,
  /\b(el|nuestro)\s+equipo\s+(juridico\s+)?(ya\s+)?(va a|se)\s+(poner|pondra|contactar)/,
];

/** A mensagem afirma que o caso já foi para uma pessoa? */
export function anunciaEncaminhamento(frase: string): boolean {
  const t = normalizar(frase);
  return ANUNCIA_ENCAMINHAMENTO.some((re) => re.test(t));
}

// ─── UMA PERGUNTA POR MENSAGEM ───
//
// O prompt sempre disse "UMA pergunta por vez, nunca duas". Numa conversa real de 28/08 a
// Ana escreveu "qual é o seu nome e de onde você é?" e, logo depois, "você está no Brasil
// agora, certo? Me conta também como foi essa multa — você recebeu algum papel da Polícia
// Federal?".
//
// A pessoa respondeu "sim". Sim para qual? "Está no Brasil" e "recebeu o papel da PF" são
// fatos diferentes, e o segundo decide se existe prazo correndo. O que entra na ficha a
// partir daí é suposição com cara de informação — e quem lê é o advogado.
//
// A REGRA PIOROU JUSTAMENTE QUANDO AS MENSAGENS ENCURTARAM: pedido para ser breve, o
// modelo comprime fundindo perguntas. Por isso ela deixou de ser só uma linha do prompt.
//
// O CORTE É CONSERVADOR: mantém a PRIMEIRA pergunta e derruba as seguintes. A primeira é
// a que a Ana escolheu fazer, e a que vem antes na leitura de quem recebe. As outras
// voltam no turno seguinte — aí com a resposta da primeira na mão.

/** A frase é uma pergunta? */
function ehPergunta(frase: string): boolean {
  return frase.includes("?");
}

/**
 * Frases-pergunta além da primeira. Devolve os índices a remover.
 *
 * Só conta frase com "?": uma pergunta indireta ("me conta como foi") não é ambígua do
 * mesmo jeito — a pessoa responde a ela ou à explícita, e ficar caçando isso por regex
 * derrubaria mensagem boa. O sinal que importa é o ponto de interrogação repetido.
 */
export function perguntasExcedentes(frases: string[]): number[] {
  const indices: number[] = [];
  let jaTemUma = false;
  for (let i = 0; i < frases.length; i++) {
    if (!ehPergunta(frases[i])) continue;
    if (!jaTemUma) {
      jaTemUma = true;
      continue;
    }
    indices.push(i);
  }
  return indices;
}

/**
 * A revisão completa de um turno.
 *
 * `encaminhou` é o FATO, não a intenção: verdadeiro só quando `transferir_para_humano`
 * rodou e devolveu ok. Falso, toda frase que anuncia encaminhamento sai junto com as que
 * dão parecer.
 */
export function revisarTurno(
  resposta: string,
  opts: { idioma?: string | null; encaminhou: boolean },
): RevisaoDeSaida {
  const texto = resposta ?? "";
  if (!texto.trim()) return { texto, cortes: [] };

  const frases = emFrases(texto);
  const cortes: string[] = [];

  // Calculado sobre as frases que SOBREVIVEM aos outros cortes, e não sobre o texto
  // bruto: se a primeira pergunta for cortada por dar parecer, quem passa a ser "a
  // primeira" é a seguinte — e ela tem de ficar, senão a mensagem sai sem pergunta
  // nenhuma e a conversa morre ali.
  const sobreviventes = frases.filter(
    (f) => !f.trim() || !(qualificaSituacao(f) || (!opts.encaminhou && anunciaEncaminhamento(f))),
  );
  const excedentes = new Set(perguntasExcedentes(sobreviventes).map((i) => sobreviventes[i]));

  const mantidas = frases.filter((f) => {
    if (!f.trim()) return true;
    const proibida =
      qualificaSituacao(f) || (!opts.encaminhou && anunciaEncaminhamento(f)) || excedentes.has(f);
    if (proibida) {
      cortes.push(f.trim());
      return false;
    }
    return true;
  });

  if (!cortes.length) return { texto, cortes: [] };

  const limpo = mantidas.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { texto: limpo || acolhimentoNeutro(opts.idioma), cortes };
}
