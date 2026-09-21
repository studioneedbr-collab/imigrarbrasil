import type { IconName } from "@/components/dashboard/ui";

// AS DUAS FAMÍLIAS DE TELA DO PAINEL.
//
// O menu tinha oito itens para responder duas perguntas. "Fila", "Meus atendimentos",
// "CRM" e "Conversas" são quatro recortes do MESMO dado, e a pergunta que o time fazia
// era literal: não sei o que é o quê. A linha de ajuda embaixo de cada item ajudou e não
// resolveu — item de menu irmão de outro item de menu parece tela DIFERENTE, não recorte.
//
// Recorte se mostra com aba. Duas entradas no menu, e dentro de cada uma as abas do mesmo
// assunto, lado a lado, com o nome do recorte e o que ele responde.
//
// OS ENDEREÇOS NÃO MUDAM. Cada aba continua sendo a sua rota de sempre — estão em link de
// e-mail, em favorito e na memória de quem usa o painel todo dia, e uma tela que muda de
// endereço é indistinguível de uma tela que sumiu. É a mesma razão pela qual
// /dashboard/atendimentos continua respondendo (redireciona para o CRM).
//
// Mora no domínio, e não dentro do componente, porque tem dois leitores que não podem
// discordar: as abas e o menu lateral — que precisa saber quais rotas acendem cada item.

export interface Aba {
  href: string;
  label: string;
  /**
   * O que ESTE recorte responde.
   *
   * SAIU DA TELA E VIROU TOOLTIP. Ela existia para distinguir uma aba da irmã, e fazia
   * isso — ao custo de transformar uma faixa de navegação em quatro parágrafos. Com
   * ícone e nome, a aba já se distingue de relance; a frase continua disponível para
   * quem parar o cursor em cima, que é quem ainda tem a dúvida.
   */
  nota: string;
  icone: IconName;
}

/** O trabalho do dia: os três recortes da mesma carteira de casos. */
export const ABAS_ATENDIMENTO: Aba[] = [
  { href: "/dashboard", label: "Fila", nota: "o que vence primeiro", icone: "bolt" },
  { href: "/dashboard/meus", label: "Meus", nota: "os casos que são seus", icone: "check" },
  { href: "/dashboard/crm", label: "Funil", nota: "onde cada caso está", icone: "activity" },
  // A importação fica como aba do atendimento, e não como item de menu: ela é uma coisa
  // que se faz ao funil, não uma tela que se visita. Quem procura por ela está olhando o
  // quadro e pensando "preciso trazer aquela planilha para cá".
  { href: "/dashboard/importar", label: "Importar", nota: "trazer uma planilha", icone: "plus" },
];

/** O que entrou pelo WhatsApp — inclusive o que não virou caso. */
export const ABAS_CONVERSAS: Aba[] = [
  { href: "/dashboard/conversations", label: "Conversas", nota: "tudo que entrou", icone: "chat" },
  { href: "/dashboard/filtradas", label: "Filtradas", nota: "o que o agente descartou", icone: "search" },
  { href: "/dashboard/documentos", label: "Documentos", nota: "anexos recebidos", icone: "doc" },
  { href: "/dashboard/audios", label: "Áudios não lidos", nota: "falhas de transcrição", icone: "pulse" },
];

/**
 * A aba (ou o item de menu) está ativa?
 *
 * `/dashboard` é exato de propósito: ele é prefixo de todas as outras rotas do painel, e
 * comparar por prefixo acenderia a Fila em qualquer tela.
 */
export function rotaAtiva(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
