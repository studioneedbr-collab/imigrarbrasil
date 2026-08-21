-- 014 — Coluna `setor` em leads + estágio 'desqualificado' liberado no CHECK.
--
-- Dois buracos que só apareceram agora, com a identificação de fornecedor e de
-- contatos fora do escopo comercial (imprensa, institucional):
--
-- 1) `leads.setor` NUNCA foi criada por nenhuma migration, mas updateLead grava o
--    campo (supabase-repository.ts) e a tela de Leads filtra a pipeline por ele.
--    Contra o Supabase, o PostgREST rejeitava o update inteiro com "column 'setor'
--    of relation 'leads' does not exist" — ou seja, o roteamento por setor só
--    funcionava no modo memória.
--
-- 2) O CHECK de `stage` (003/004) não tinha 'desqualificado', que o app usa desde
--    então (tool registrar_dados_lead, lead-score, Kanban). Registrar um fornecedor
--    como desqualificado, que é o caminho novo, batia direto na constraint.
--
-- Os setores 'suprimentos' (fornecedor) e 'diretoria' (imprensa/institucional) são
-- novos e não existem em users.setor de propósito: são destinos de lead, não
-- escopos de login. Por isso o CHECK de users (migration 010) fica como está.

alter table leads
  add column if not exists setor text
  check (setor is null or setor in
    ('comercial','operacional','rh','departamento_pessoal','suprimentos','diretoria'));

-- O CHECK de stage é inline nas migrations 003/004, então o nome é o gerado pelo
-- Postgres. Dropar por nome fixo quebraria em banco que veio por outro caminho:
-- varremos pg_constraint e derrubamos qualquer CHECK que mencione 'qualificado'.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'leads'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%qualificado%'
  loop
    execute format('alter table leads drop constraint %I', c.conname);
  end loop;
end $$;

alter table leads add constraint leads_stage_check
  check (stage is null or stage in
    ('novo','qualificado','orcado','transferido','ganho','perdido','desqualificado'));

-- A tela de Leads lista sempre por setor; o índice parcial evita seq scan.
create index if not exists idx_leads_setor on leads(setor) where setor is not null;
