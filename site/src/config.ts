// Tudo que aparece em mais de uma página mora aqui. Mudou o telefone? É uma linha.

import editavel from "./data/site.json";

// O que o painel edita (telefone, redes sociais, números, textos dos botões) vem de
// src/data/site.json, que o build reescreve a partir do painel (scripts/puxar-conteudo.mjs).
// O que não se edita pela tela — razão social, CNPJ, ano de fundação — fica aqui.

export const SITE = {
  url: "https://imigrarbrasil.com",
  nome: "Imigrar Brasil",
  razaoSocial: "Imigrar Brasil Ltda.",
  cnpj: "35.842.274/0001-02",
  fundacao: 2019,
  descricao:
    "Imigrar Brasil: consultoria jurídica em imigração, vistos, residência e naturalização. Atendemos estrangeiros com segurança, agilidade e suporte completo.",
  telefone: editavel.telefone,
  telefoneE164: `+${editavel.whatsapp}`,
  whatsapp: editavel.whatsapp,
  email: editavel.email,
  endereco: editavel.endereco,
  geo: { lat: -23.5442, lng: -46.6441 },
  // Só as redes preenchidas no painel aparecem no rodapé e no schema.
  social: Object.fromEntries(Object.entries(editavel.social).filter(([, v]) => v)) as Record<string, string>,
  // Os números da home. Ficam escritos no HTML (é o que o Google lê); a contagem animada
  // é só visual.
  numeros: editavel.numeros,
  ctas: editavel.ctas,
  ebookCheckout: editavel.ebookCheckout,
};

export const MENU = [
  { href: "/", rotulo: "Home" },
  { href: "/quem-somos/", rotulo: "Quem Somos" },
  { href: "/equipe/", rotulo: "Equipe" },
  { href: "/nossos-servicos/", rotulo: "Serviços" },
  { href: "/blog-imigracao-brasil/", rotulo: "Blog" },
  { href: "/fale-conosco/", rotulo: "Contato" },
] as const;

export const whatsappLink = (msg: string = editavel.ctas.mensagemWhatsapp) =>
  `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(msg)}`;

// Cargo de cada sócio — o WordPress guardava isso só no texto do card da home.
export const CARGOS: Record<string, string> = {
  "walter-gama": "Sócio fundador e advogado",
  "sergio-reis": "Sócio e diretor comercial",
};

// Ícone e frase curta de cada categoria, na ordem em que aparecem.
export const CATEGORIAS_INFO: Record<string, { ordem: number; chamada: string; resumo: string }> = {
  "vistos-autorizacoes-de-entrada": { ordem: 1, chamada: "Entre no Brasil", resumo: "Visto certo para o objetivo certo: estudo, saúde, pesquisa, trabalho remoto e mais." },
  "autorizacoes-de-residencia-registro": { ordem: 2, chamada: "Fique legal", resumo: "Residência por família, investimento, aposentadoria, Mercosul e CRNM." },
  "nacionalidade-naturalizacao": { ordem: 3, chamada: "Oficialmente brasileiro", resumo: "Naturalização em todas as modalidades e reconhecimento de nacionalidade." },
  "defesa-regularizacao-migratoria": { ordem: 4, chamada: "Resolva pendências", resumo: "Recursos, indeferimentos, overstay e multa migratória." },
  "consultoria-empresarial-investimentos": { ordem: 5, chamada: "Sua empresa no Brasil", resumo: "Empreendedor, startup, investimento estrangeiro e imóveis." },
  "servicos-documentais-relocation": { ordem: 6, chamada: "Chegue organizado", resumo: "CPF, conta bancária, apostilamento e mudança da família inteira." },
};
