// A DECISÃO DE ATENDER — pura, isolada e testável.
//
// Três níveis de ativação chegam aqui e saem como UMA decisão: o que fazer com esta
// mensagem, agora. O webhook não decide nada sozinho; ele pergunta a este módulo e
// obedece. Foi de propósito: a regra que separa "o agente está desligado" de "a pessoa
// vai ficar sem resposta" é a regra mais fácil de errar do sistema inteiro, e ela não
// pode viver espalhada dentro de um handler de 400 linhas.
//
// A REGRA QUE MANDA EM TODAS AS OUTRAS: desligado nunca significa ignorar. Nenhum
// caminho daqui descarta a mensagem — ela já foi gravada antes desta função ser
// chamada. O que se decide aqui é só o que VOLTA para o cliente.

import type { AmbienteInstancia, ChaveGeral, ModoDesligado, ZapiInstancia } from "@/lib/domain/types";
import { proximoAtendimento } from "@/lib/agent/expediente";

/**
 * responder      atendimento normal — a Ana responde e envia.
 * silencio       nada volta. Só existe em instância de teste.
 * resposta_fixa  uma frase avisando que um humano responde, e quando.
 * sombra         processa e grava o rascunho, não envia nada.
 */
export type AcaoDoAgente = "responder" | "silencio" | "resposta_fixa" | "sombra";

/** Qual nível desligou. Vai para o log e para a explicação na tela. */
export type NivelDesligado = "chave_geral" | "instancia" | "conversa";

export interface DecisaoDeAtendimento {
  acao: AcaoDoAgente;
  nivel: NivelDesligado | null;
  /** Uma frase dizendo por quê. Vai para o log do webhook e para o painel. */
  motivo: string;
  /**
   * A conversa entra na fila marcada como "aguardando primeira resposta humana", com o
   * relógio de SLA correndo.
   *
   * Falso para conversa já assumida (o humano JÁ está lá — o relógio dele é outro) e
   * falso para instância de teste, que por definição não entra na fila de trabalho.
   */
  aguardaHumano: boolean;
}

/** A instância, do jeito que a decisão precisa lê-la. */
export type InstanciaParaDecisao = Pick<
  ZapiInstancia,
  "nome" | "ambiente" | "ativo" | "modoDesligado" | "respostaFixa"
>;

export interface ContextoDeAtendimento {
  chaveGeral: ChaveGeral;
  /** A instância que recebeu a mensagem. `null` quando não deu para reconhecê-la. */
  instancia: InstanciaParaDecisao | null;
  /** E-mail do atendente que assumiu esta conversa, se houver (NÍVEL 3). */
  conversaAssumidaPor?: string | null;
  /**
   * O AGENTE JÁ ENCAMINHOU ESTA CONVERSA ao time jurídico (`status: 'transferred'`,
   * ninguém assumiu ainda). Também cala o agente — ver `decidirAtendimento`.
   */
  conversaJaEncaminhada?: boolean;
}

/**
 * O texto padrão do modo `resposta_fixa`, quando a instância não tem um próprio.
 *
 * A promessa de tempo sai de `proximoAtendimento`, e não de um "em instantes" fixo: às
 * 21h de sábado não existe ninguém para responder, e prometer o que não se cumpre é
 * pior do que a demora em si.
 */
export function mensagemAgenteDesligado(agora: Date = new Date(), textoDaInstancia?: string | null): string {
  const proprio = (textoDaInstancia ?? "").trim();
  if (proprio) return proprio;
  const { quando } = proximoAtendimento(agora);
  return (
    "Recebi sua mensagem e ela já está registrada aqui. " +
    `Uma pessoa da equipe vai te responder ${quando === "agora" ? "em seguida" : quando}. ` +
    "Se puder, já me conta o que está acontecendo — assim quem for te atender chega com o caso na mão."
  );
}

/**
 * Silêncio total é privilégio de instância de teste.
 *
 * Em produção, do outro lado do número tem alguém em situação irregular que escreveu
 * pedindo ajuda. Deixá-la sem NENHUMA resposta é o pior desfecho possível — pior até do
 * que uma resposta errada, porque a resposta errada pelo menos é visível e corrigível.
 * Se alguém conseguir gravar `silencio` numa instância de produção (o banco barra, mas
 * este módulo não conta com isso), aqui vira `resposta_fixa`.
 */
export function modoEfetivo(modo: ModoDesligado, ambiente: AmbienteInstancia): ModoDesligado {
  if (modo === "silencio" && ambiente === "producao") return "resposta_fixa";
  return modo;
}

export function decidirAtendimento(ctx: ContextoDeAtendimento): DecisaoDeAtendimento {
  // NÍVEL 3 primeiro, e não por acaso: quando um humano está digitando naquela conversa,
  // nenhum estado dos outros dois níveis deve fazer o agente responder por cima dele.
  if (ctx.conversaAssumidaPor) {
    return {
      acao: "silencio",
      nivel: "conversa",
      motivo: `${ctx.conversaAssumidaPor} assumiu esta conversa.`,
      aguardaHumano: false,
    };
  }

  // ENCAMINHOU, CALOU. Este é o outro lado do nível 3, e ele faltava.
  //
  // Numa conversa real a Ana disse "ya pasé tu caso al equipo jurídico" e seguiu
  // conversando por mais duas mensagens. Do lado de lá isso é ambíguo do pior jeito: a
  // pessoa não sabe mais se está falando com o time jurídico ou não, e o que ela contar a
  // partir dali — o detalhe do caso, a data da notificação — vai para alguém que não é
  // advogado e pode nunca chegar a quem vai cuidar dela. Pior: cada resposta nova da Ana
  // parece atendimento em andamento, e o caso deixa de PARECER que está esperando gente.
  //
  // Nada é descartado: a mensagem entra, aparece no painel e o relógio de primeira
  // resposta humana continua correndo. O agente é que não fala mais. Ele volta quando um
  // humano devolver a conversa a ele — `releaseConversation` põe o status em `active`.
  if (ctx.conversaJaEncaminhada) {
    return {
      acao: "silencio",
      nivel: "conversa",
      motivo: "O agente já encaminhou esta conversa ao time jurídico e está em silêncio.",
      // Teste nunca entra na fila de trabalho, aqui como em todo o resto.
      aguardaHumano: ctx.instancia?.ambiente !== "teste",
    };
  }

  // INSTÂNCIA NÃO RECONHECIDA. A mensagem chegou por um número que o painel não sabe de
  // quem é: pode ser instância nova ainda não cadastrada, pode ser webhook apontado para
  // o lugar errado. Nos dois casos a resposta certa é sombra — grava tudo, não manda
  // nada. Responder por um canal que não se sabe qual é seria o pior dos dois erros.
  if (!ctx.instancia) {
    return {
      acao: "sombra",
      nivel: "instancia",
      motivo: "Mensagem recebida por uma instância Z-API que não está cadastrada no painel.",
      aguardaHumano: true,
    };
  }

  const { nome, ambiente, ativo, modoDesligado } = ctx.instancia;
  // Teste nunca entra na fila de trabalho — é a mesma regra que a tira das métricas.
  const aguardaHumano = ambiente === "producao";

  if (!ctx.chaveGeral.ligada) {
    return {
      acao: modoEfetivo(modoDesligado, ambiente),
      nivel: "chave_geral",
      motivo: "A chave geral do agente está desligada.",
      aguardaHumano,
    };
  }

  if (!ativo) {
    return {
      acao: modoEfetivo(modoDesligado, ambiente),
      nivel: "instancia",
      motivo: `A instância "${nome}" está desligada.`,
      aguardaHumano,
    };
  }

  return { acao: "responder", nivel: null, motivo: "Agente ativo.", aguardaHumano: false };
}

/**
 * A chave geral quando ainda não existe registro nenhum no banco.
 *
 * LIGADA. Um sistema que sobe desligado depois de um deploy é um sistema que deixa de
 * atender sem ninguém saber por quê — e o dia em que a linha de config sumir do banco
 * não pode ser o dia em que o WhatsApp da empresa emudece. Quem desliga, desliga
 * explicitamente, e fica registrado.
 */
export const CHAVE_GERAL_PADRAO: ChaveGeral = { ligada: true, autor: null, em: null, motivo: null };

/**
 * O que a faixa vermelha do topo mostra quando a chave geral está desligada.
 *
 * `voce` é o e-mail de quem está lendo a faixa, e existe por um motivo concreto: o painel
 * mostrava "Agente desligado por studioneedbr@gmail.com" para alguém que não tinha como
 * saber se aquele e-mail era o dele. Uma frase que nomeia uma conta sem dizer se é a SUA
 * transforma um aviso em charada — e a pergunta que ela levanta ("fui eu que desliguei?")
 * é exatamente a que decide se a pessoa religa agora ou vai procurar quem desligou.
 */
export function faixaDaChaveGeral(chave: ChaveGeral, voce?: string | null): string | null {
  if (chave.ligada) return null;
  const autor = (chave.autor ?? "").trim();
  const souEu = !!autor && !!voce && autor.toLowerCase() === voce.trim().toLowerCase();
  const quem = autor ? (souEu ? `você (${autor})` : autor) : "alguém";
  const quando = chave.em ? new Date(chave.em).toLocaleString("pt-BR") : "data desconhecida";
  const motivo = (chave.motivo ?? "").trim() || "sem motivo registrado";
  return `Agente desligado por ${quem} desde ${quando} — ${motivo}`;
}
