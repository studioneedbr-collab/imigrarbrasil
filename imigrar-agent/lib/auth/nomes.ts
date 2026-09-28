import type { Repository } from "@/lib/data/repository";

/**
 * O NOME DE QUEM FEZ, NO LUGAR DO E-MAIL.
 *
 * O painel grava autoria por e-mail — no log de acesso, em `assumedBy` da conversa, nos
 * toques de follow-up. Como IDENTIDADE isso está certo: e-mail é único e não muda quando
 * alguém corrige a grafia do próprio nome.
 *
 * Como TEXTO NA TELA está errado. A faixa da conversa dizia
 * "sergio.reis@imigrarbrasil.com.br assumiu esta conversa" — e quem lê são as três ou
 * quatro pessoas do escritório, que se chamam pelo primeiro nome. Ninguém precisa do
 * domínio do e-mail para saber quem é o Sérgio; o endereço inteiro só empurra o resto da
 * frase para fora da linha.
 *
 * A resolução acontece no SERVIDOR, e não no navegador, por dois motivos: a tela teria de
 * baixar a lista de usuários inteira para traduzir um nome, e essa lista é PII de
 * funcionário que não tem por que trafegar para desenhar uma faixa.
 */
export async function nomesPorEmail(repo: Repository): Promise<Map<string, string>> {
  try {
    const usuarios = await repo.listUsers();
    return new Map(
      usuarios
        .filter((u) => u.email && u.name?.trim())
        .map((u) => [u.email.toLowerCase(), u.name!.trim()]),
    );
  } catch {
    // Sem a lista, o e-mail continua sendo mostrado. Falhar aqui não pode apagar a
    // informação de quem assumiu — ela é o motivo da faixa existir.
    return new Map();
  }
}

/**
 * O PRIMEIRO NOME basta, e é como as pessoas se chamam aqui.
 *
 * "Sérgio assumiu" cabe na linha; "Sérgio Reis de Oliveira assumiu esta conversa" não, e
 * quebra a faixa em duas. Quem precisa do nome inteiro está na tela de Usuários.
 */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}

/** O nome de quem, com o e-mail como último recurso — nunca vazio. */
export function quemFez(email: string | null | undefined, nomes: Map<string, string>): string | null {
  if (!email) return null;
  const nome = nomes.get(email.toLowerCase());
  return nome ? primeiroNome(nome) : email;
}
