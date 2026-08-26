// BUSCA DE FUNÇÃO POR DIGITAÇÃO.
//
// O catálogo passa de 100 funções, e num <select> nativo achar "Auxiliar de Serviços
// Gerais" é rolar uma lista de tela cheia até a letra certa. Aqui a busca ignora acento
// e caixa e casa por PEDAÇO, em qualquer ordem — "serv ger", "gerais aux" e "asg"
// chegam todos no mesmo lugar.
//
// Vive fora do componente de propósito: o arquivo .tsx não é parseado pela suíte de
// testes (ambiente node, sem JSX), e esta é a parte que precisa de teste.

export interface ServiceSearchItem {
  name: string;
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Iniciais da função ("Auxiliar de Serviços Gerais" → "asg"), como todo mundo digita. */
export function sigla(nome: string): string {
  return normalizar(nome)
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .map((w) => w[0])
    .join("");
}

export function filtrarServicos<T extends ServiceSearchItem>(itens: T[], busca: string): T[] {
  const q = normalizar(busca).trim();
  if (!q) return itens;
  const termos = q.split(/\s+/);
  const semEspaco = q.replace(/\s+/g, "");
  return itens.filter((s) => {
    const alvo = normalizar(s.name);
    if (termos.every((t) => alvo.includes(t))) return true;
    return sigla(s.name).startsWith(semEspaco);
  });
}
