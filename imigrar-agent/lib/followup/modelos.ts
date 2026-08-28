// OS MODELOS DE FOLLOW-UP — um por motivo de espera, traduzido para cada idioma.
//
// ESTE É O PONTO QUE NÃO PODE FALHAR. O projeto inteiro existe porque o público é
// multilíngue: mandar follow-up em português para um haitiano destrói o produto, e
// destrói mais do que uma mensagem perdida — comunica que ninguém do outro lado percebeu
// com quem está falando, para uma pessoa que já desconfia de instituição.
//
// Por isso NÃO EXISTE IDIOMA DE RESERVA aqui. Sem modelo na língua da pessoa, o disparo
// não acontece: vira tarefa para alguém escrever à mão. Um fallback para português seria
// a forma mais fácil de o defeito voltar sem ninguém perceber, porque tudo continuaria
// "funcionando".
//
// A VARIAÇÃO existe pelo outro motivo do arquivo: cem mensagens idênticas saindo do mesmo
// número em um dia é a assinatura de disparo em massa que os classificadores do WhatsApp
// procuram. Cada modelo guarda variantes do mesmo texto, e o toque escolhe uma delas de
// um jeito estável — o mesmo caso, no mesmo toque, escolhe sempre a mesma frase, para que
// reprocessar o cron não reescreva a mensagem que já foi aprovada.

import type { MotivoEspera } from "@/lib/followup/motivos";

/** Como a mensagem sai. `rascunho` é o padrão, e é o padrão por segurança. */
export type EnvioDoModelo = "rascunho" | "automatico";

export interface ModeloFollowup {
  id: string;
  motivo: MotivoEspera;
  /** ISO-639-1 do idioma DESTE texto ("pt", "es", "ht"…). */
  idioma: string;
  texto: string;
  /**
   * Outras redações do mesmo recado. Não são versões melhores nem piores: existem para
   * que dez pessoas esperando o consulado não recebam exatamente a mesma frase no mesmo
   * dia, saindo do mesmo número.
   */
  variantes: string[];
  envio: EnvioDoModelo;
  ativo: boolean;
}

/**
 * O modelo desta pessoa, ou nada.
 *
 * Casa por (motivo, idioma) EXATO. `pt-BR` e `pt` são o mesmo idioma para efeito de
 * escrita, então o código é comparado pela raiz — mas "não achei em crioulo, mando em
 * francês" NÃO acontece: são línguas diferentes para quem lê, e a semelhança entre elas
 * é justamente o que faria o erro passar despercebido no painel.
 */
export function escolherModelo(
  modelos: ModeloFollowup[],
  motivo: MotivoEspera,
  idioma: string | null | undefined,
): ModeloFollowup | null {
  const lingua = raizDoIdioma(idioma);
  if (!lingua) return null;
  return (
    modelos.find(
      (m) => m.ativo && m.motivo === motivo && raizDoIdioma(m.idioma) === lingua,
    ) ?? null
  );
}

export function raizDoIdioma(codigo: string | null | undefined): string | null {
  const c = (codigo ?? "").trim().toLowerCase();
  if (!c) return null;
  return c.split(/[-_]/)[0] || null;
}

/**
 * O texto que sai neste toque.
 *
 * A escolha da variante é DETERMINÍSTICA a partir do caso e do número do toque, e não
 * aleatória: o cron pode passar duas vezes pelo mesmo pendente (reprocessamento, retry) e
 * a mensagem já mostrada ao responsável para aprovação não pode mudar debaixo dele.
 */
export function textoDoToque(
  modelo: ModeloFollowup,
  contexto: { nome?: string | null; servico?: string | null; chave: string; toque: number },
): string {
  const redacoes = [modelo.texto, ...modelo.variantes.filter((v) => v.trim())];
  const escolhida = redacoes[semente(`${contexto.chave}#${contexto.toque}`) % redacoes.length];
  return preencher(escolhida, contexto);
}

/**
 * Os únicos campos que um modelo pode interpolar.
 *
 * Deliberadamente poucos. Quanto mais campos, maior a chance de uma mensagem sair com
 * "Olá {nome}" literal na tela de alguém — e um modelo é traduzido por pessoas que não
 * leem o código. Campo ausente some junto com o espaço à frente, para que "Oi {nome}!"
 * vire "Oi!" e não "Oi !".
 */
export function preencher(
  texto: string,
  dados: { nome?: string | null; servico?: string | null },
): string {
  return texto
    .replace(/ ?\{nome\}/g, dados.nome ? ` ${dados.nome}` : "")
    .replace(/ ?\{servico\}/g, dados.servico ? ` ${dados.servico}` : "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Hash estável e minúsculo. Não é criptografia: é só para escolher uma frase entre poucas. */
function semente(chave: string): number {
  let h = 2166136261;
  for (let i = 0; i < chave.length; i++) {
    h ^= chave.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * A ÚLTIMA MENSAGEM DA SEQUÊNCIA.
 *
 * Sai uma vez, depois do terceiro toque sem resposta, no mesmo movimento em que o caso vai
 * para PERDIDO com motivo "sumiu". Ela existe para que o silêncio do escritório a partir
 * dali seja uma escolha comunicada, e não um abandono: muita gente aqui parou de responder
 * por medo ou por vergonha de não ter o documento, e precisa saber que a porta continua
 * aberta sem precisar explicar nada.
 *
 * Não pede resposta, não pergunta nada e não marca prazo — qualquer uma dessas coisas
 * transformaria a despedida num quarto toque.
 *
 * Fica em código, e não na tabela de modelos, de propósito: é a mensagem que sai quando
 * NÃO há modelo aprovado para mandar, e depender de cadastro para ela seria deixar o caso
 * mais delicado do fluxo sem texto nenhum.
 */
const DESPEDIDA: Record<string, string> = {
  pt: "Não quero te incomodar mais por aqui. A Imigrar Brasil fica à disposição quando você quiser retomar — é só escrever neste mesmo número. 🙏",
  es: "No quiero molestarte más por aquí. Imigrar Brasil queda a tu disposición cuando quieras retomar — solo escribe a este mismo número.",
  en: "I won't write again for now. Imigrar Brasil is here whenever you want to pick this back up — just message this same number.",
  fr: "Je ne vais plus vous écrire pour l'instant. Imigrar Brasil reste disponible quand vous voudrez reprendre — écrivez simplement à ce même numéro.",
  ht: "Mwen p ap ekri ou ankò pou kounye a. Imigrar Brasil la lè ou vle rekòmanse — jis ekri nan menm nimewo sa a.",
};

/** A despedida no idioma da pessoa, ou nada — e sem idioma o caso fecha em silêncio. */
export function despedidaDaSequencia(idioma: string | null | undefined): string | null {
  const lingua = raizDoIdioma(idioma);
  return lingua ? DESPEDIDA[lingua] ?? null : null;
}
