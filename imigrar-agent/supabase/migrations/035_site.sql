-- 035 — O SITE PASSA A SER EDITADO PELO PAINEL.
--
-- O site imigrarbrasil.com é HTML estático (pasta site/ do repositório), gerado no build a
-- partir de JSON. Até aqui o JSON morava no repositório e só mudava com commit. A partir
-- desta migration ele mora AQUI: o painel edita, e o botão Publicar dispara o build, que
-- busca o conteúdo em /api/site/exportar.
--
-- ── UMA TABELA DE CONTEÚDO, NÃO UMA POR TIPO ─────────────────────────────────────────
--
-- Post, serviço e configuração têm formas diferentes, mas o painel faz a mesma coisa com
-- todos: listar, abrir, salvar, apagar, publicar. A forma de cada um é validada em código
-- (lib/site/conteudo.ts, zod) — o mesmo lugar que define o JSON que o site lê. Uma coluna
-- por campo aqui seria uma segunda cópia desse formato, e este projeto já sabe o que
-- acontece com listas escritas em dois lugares.

-- As colunas se chamam tipo_conteudo e tipo_evento, e não `tipo`: `tipo` já tem check em
-- quatro outras tabelas, e tests/constraints-e-dominio lê o check PELO NOME da coluna.
-- Com um nome repetido, a lista desta tabela e a dos motivos seriam indistinguíveis.

create table if not exists site_conteudo (
  tipo_conteudo text not null check (tipo_conteudo in ('post','servico','config')),
  slug text not null,
  dados jsonb not null,
  -- Rascunho fica no painel e não vai para o site no próximo Publicar.
  publicado boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  primary key (tipo_conteudo, slug)
);

-- ── OS CLIQUES E AS VISITAS DO SITE ──────────────────────────────────────────────────
--
-- ANÔNIMOS POR CONSTRUÇÃO. Não há IP, não há cookie, não há identificador da pessoa:
-- só o que aconteceu, onde e de que tipo de aparelho. É o que responde "qual CTA traz
-- conversa" sem virar um rastreador — e sem pedir banner de consentimento (LGPD).
--
-- Quem chega a falar com o escritório vira lead pelo caminho próprio (captura do site);
-- este registro nunca é ligado a um lead.

create table if not exists site_eventos (
  id bigint generated always as identity primary key,
  tipo_evento text not null check (tipo_evento in ('visita','clique','formulario')),
  -- O que foi clicado: "whatsapp", "cta:hero", "telefone", "servico:<slug>"…
  alvo text,
  pagina text not null,
  idioma text,
  pais text,
  dispositivo text check (dispositivo in ('celular','computador','tablet')),
  -- De onde veio: só o domínio ("google.com"), ou o utm_source quando houver.
  origem text,
  criado_em timestamptz not null default now()
);

create index if not exists site_eventos_criado_em on site_eventos (criado_em desc);
create index if not exists site_eventos_tipo_criado on site_eventos (tipo_evento, criado_em desc);

-- ── AS IMAGENS QUE O PAINEL ENVIA ────────────────────────────────────────────────────
--
-- Bucket público: são as imagens dos posts e serviços, que vão ser públicas no site de
-- qualquer jeito. O build baixa cada uma para dentro do site, então o endereço do
-- Supabase nunca aparece para quem visita.

insert into storage.buckets (id, name, public)
values ('site', 'site', true)
on conflict (id) do nothing;
