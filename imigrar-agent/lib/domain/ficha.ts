// A FICHA MÍNIMA — o que precisa estar preenchido para um caso chegar ao advogado.
//
// Mora no domínio, e não junto da captura, porque tem DOIS leitores que não podem
// discordar: o atendimento, onde ela segura o encaminhamento de uma ficha vazia
// (lib/agent/lead-capture.ts, lib/agent/tools.ts), e o PAINEL, onde ela diz o que ainda
// falta perguntar. Duas definições de "ficha completa" é como um time passa a não confiar
// no que a tela mostra.
//
// E mora aqui, e não em lead-capture, por um segundo motivo bem concreto: aquele módulo
// importa as tabelas de triagem inteiras (nacionalidades, gentílicos, expressões em três
// idiomas), e a lateral do caso é um componente de cliente. Uma função que só lê campos de
// um objeto não deveria arrastar 26 KB de regex para dentro do bundle do painel.

import type { Lead } from "@/lib/domain/types";

export interface DossieFaltando {
  /** Rótulos legíveis do que ainda falta, na ordem em que vale a pena descobrir. */
  faltam: string[];
  /** As mesmas pendências, na mesma ordem, como pergunta que se pode fazer ao cliente. */
  perguntas: string[];
  /** Nada essencial falta — o time jurídico consegue pegar o caso. */
  completo: boolean;
  /** Dados bons de ter, que NÃO seguram nada. */
  complementares: string[];
}

/**
 * A FICHA MÍNIMA DA IMIGRAR BRASIL — o que o advogado precisa ter na mão quando pegar
 * esta conversa.
 *
 * A lista nasceu de uma conversa real que foi transferida com quatro campos preenchidos e
 * sem o nome da pessoa. Quem ligou não sabia com quem estava falando, e ninguém sabia o
 * que corria contra o caso. Por isso três campos entraram aqui:
 *
 * - O NOME. Parece óbvio e era justamente o que faltava.
 * - O RELÓGIO. Todo caso tem um: as aulas que começam, o contrato que assina, o
 *   passaporte que vence. Sem nenhuma noção disso não dá para priorizar a fila. Prazo
 *   PROCESSUAL (`temPrazoCorrendo`) também conta — é o relógio mais curto de todos.
 * - A INTENÇÃO. "Posso pedir para o time te orientar?" não separa nada: todo mundo aceita
 *   ajuda de graça. O que separa é a pessoa dizer se quer tocar sozinha ou que o
 *   escritório cuide. Sem essa resposta, a fila enche de quem nunca ia contratar.
 *
 * Usa os campos do lead com a leitura deste domínio: `clientType` guarda a nacionalidade,
 * `region` onde a pessoa está agora e `servicesInterested` o que ela procura.
 *
 * NADA AQUI SEGURA UM CASO URGENTE. Prazo correndo, situação irregular, refúgio ou risco
 * vão ao time jurídico com a ficha pela metade — ver `avaliarEncaminhamentoComercial`.
 */
export function qualificacaoFaltando(lead: Lead | null): DossieFaltando {
  const temRelogio =
    !!lead?.relogioDoCaso || !!lead?.temPrazoCorrendo || !!lead?.urgency;
  // Cada pendência tem dois textos: o rótulo, que vai para o modelo e para o painel, e a
  // pergunta, que pode ir direto ao cliente numa mensagem fixa. Escritos lado a lado para
  // não divergirem — o rótulo ("o nome dela") mandado ao cliente já aconteceu.
  const pendencias = [
    !lead?.contactName && { falta: "o nome dela", pergunta: "qual é o seu nome" },
    !lead?.clientType && { falta: "a nacionalidade", pergunta: "qual é a sua nacionalidade" },
    !lead?.region && {
      falta: "onde a pessoa está agora (no Brasil ou no exterior)",
      pergunta: "você está no Brasil ou no exterior neste momento",
    },
    // "O que ela quer conseguir" tem DOIS lugares: `servicesInterested` (os caminhos que
    // a triagem reconhece: refúgio, reunião familiar, naturalização) e `objetivo` (a frase
    // do caso, que o agente deduz ou um humano escreve). Checar só o primeiro fazia a ficha
    // continuar listando esta pendência com o objetivo preenchido na tela ao lado — e
    // pendência falsa aqui não é cosmética: é ela que segura o encaminhamento ao time.
    !lead?.servicesInterested?.length &&
      !lead?.objetivo?.trim() && {
        falta: "o que ela quer conseguir",
        pergunta: "o que você precisa resolver no Brasil",
      },
    !temRelogio && {
      falta: "o que pressiona o caso e quando (nem que seja 'sem urgência')",
      pergunta: "existe alguma data ou prazo que torna o seu caso urgente",
    },
    !lead?.intencao && {
      falta: "se ela prefere tocar o processo sozinha ou que o escritório cuide (pergunte UMA vez)",
      pergunta: "você prefere conduzir o processo por conta própria ou que o escritório cuide dele",
    },
  ].filter((x): x is { falta: string; pergunta: string } => !!x);
  const faltam = pendencias.map((p) => p.falta);
  const perguntas = pendencias.map((p) => p.pergunta);
  const complementares = [
    !lead?.contractDuration && "como ela entrou e o que tem hoje",
    !lead?.documentosPossui && "que documentos do país de origem ela tem em mãos",
  ].filter((x): x is string => typeof x === "string");
  return { faltam, perguntas, completo: faltam.length === 0, complementares };
}
