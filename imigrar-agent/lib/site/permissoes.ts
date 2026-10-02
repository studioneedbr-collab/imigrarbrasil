import { normalizarPapel } from "@/lib/auth/papeis";

/**
 * QUEM PODE MEXER NO SITE.
 *
 * Ver é para todo mundo do painel: quem atende quer saber de qual página o lead veio.
 * Editar e publicar, não: o que se salva aqui vai para um site público, com o nome do
 * escritório, e um erro de digitação num serviço é um erro na frente de qualquer cliente.
 * Mesmo critério dos motivos de desfecho (app/api/crm/motivos): admin e advogado.
 */
export function podeEditarSite(role: unknown): boolean {
  const papel = normalizarPapel(role);
  return papel === "admin" || papel === "advogado";
}
