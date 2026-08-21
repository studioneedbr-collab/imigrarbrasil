-- Base vetorial da Imigrar Brasil (Supabase / pgvector).
-- Dimensão 1024: serve a BGE-M3, multilingual-e5-large e text-embedding-3-large
-- (este último truncado via parâmetro `dimensions`). Trocar de modelo = reindexar tudo.

create extension if not exists vector;
create extension if not exists pg_trgm;

create table if not exists rag_chunks (
  id                    text primary key,
  fonte                 text not null,
  documento             text not null,
  colecao               text not null check (colecao in ('cartilha', 'legislacao', 'doutrina')),
  orgao                 text,
  titulo                text not null,
  secao                 text,
  diploma               text,
  artigo                text,
  temas                 text[] not null default '{}',
  idioma                text not null default 'pt',
  atualizado_em         text,
  alerta_desatualizacao text,
  pagina_inicio         int not null,
  pagina_fim            int not null,
  ordem                 int not null,
  texto                 text not null,
  texto_embed           text not null,
  embedding             vector(1024),
  busca                 tsvector generated always as (to_tsvector('portuguese', texto_embed)) stored,
  criado_em             timestamptz not null default now()
);

create index if not exists rag_chunks_embedding_idx
  on rag_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists rag_chunks_busca_idx on rag_chunks using gin (busca);
create index if not exists rag_chunks_colecao_idx on rag_chunks (colecao);
create index if not exists rag_chunks_fonte_idx on rag_chunks (fonte);

-- Busca híbrida: vetorial (multilíngue) + texto (só acerta em PT, mas pega termo
-- jurídico exato, que é onde o embedding erra). Fusão por RRF.
create or replace function buscar_chunks(
  consulta_embedding vector(1024),
  consulta_texto     text default null,
  colecoes           text[] default array['cartilha', 'legislacao', 'doutrina'],
  limite             int default 8,
  k_rrf              int default 60
)
returns table (
  id text, fonte text, documento text, colecao text, titulo text, secao text,
  diploma text, artigo text, pagina_inicio int, pagina_fim int,
  atualizado_em text, alerta_desatualizacao text, texto text, escore float
)
language sql stable
as $$
  with vetorial as (
    select c.id, row_number() over (order by c.embedding <=> consulta_embedding) as posicao
    from rag_chunks c
    where c.colecao = any(colecoes) and c.embedding is not null
    order by c.embedding <=> consulta_embedding
    limit limite * 5
  ),
  textual as (
    select c.id, row_number() over (
             order by ts_rank_cd(c.busca, plainto_tsquery('portuguese', consulta_texto)) desc
           ) as posicao
    from rag_chunks c
    where consulta_texto is not null
      and c.colecao = any(colecoes)
      and c.busca @@ plainto_tsquery('portuguese', consulta_texto)
    limit limite * 5
  ),
  fundido as (
    select coalesce(v.id, t.id) as id,
           coalesce(1.0 / (k_rrf + v.posicao), 0) + coalesce(0.5 / (k_rrf + t.posicao), 0) as escore
    from vetorial v
    full outer join textual t on t.id = v.id
  )
  select c.id, c.fonte, c.documento, c.colecao, c.titulo, c.secao,
         c.diploma, c.artigo, c.pagina_inicio, c.pagina_fim,
         c.atualizado_em, c.alerta_desatualizacao, c.texto, f.escore
  from fundido f
  join rag_chunks c on c.id = f.id
  order by f.escore desc
  limit limite;
$$;
