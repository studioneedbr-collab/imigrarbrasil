import { redirect } from "next/navigation";

/**
 * O QUADRO VIROU CRM.
 *
 * O endereço antigo continua funcionando porque ele está em link de e-mail, em favorito e
 * na memória de quem usa o painel todo dia — e uma tela que some sem deixar caminho é
 * indistinguível de uma tela quebrada.
 */
export default function AtendimentosPage() {
  redirect("/dashboard/crm");
}
