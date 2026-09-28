-- 034 — POR QUE PERDEMOS DEIXA DE SER CÓDIGO E VIRA DADO.
--
-- As categorias de desfecho eram seis, escritas numa união de tipos, num array, num enum
-- do zod e num check deste banco. Quatro lugares para a mesma lista — a divergência que
-- este projeto já pagou quatro vezes —, e nenhum deles alcançável por quem usa o sistema.
--
-- O escritório pediu para editar os rótulos e criar categorias novas pela tela, e o pedido
-- está certo: "por que perdemos" é vocabulário de quem vende. Ele muda com a operação, com
-- o serviço e com a época do ano, e não há motivo para depender de deploy. Quando a lista
-- não acompanha, todo mundo escolhe "Outro" — e "Outro" não responde nada seis meses
-- depois, que é exatamente quando alguém pergunta.
--
-- ── DOIS FUNIS PERGUNTAM COISAS DIFERENTES ───────────────────────────────────────────
--
-- Em pré-venda a pergunta é por que o lead foi DESQUALIFICADO (não era caso, não era o
-- perfil). Em venda é por que a proposta foi PERDIDA (preço, outro escritório). Uma lista
-- só faria o seletor oferecer motivo que não cabe naquele momento, e aí escolhe-se o
-- primeiro da lista — que é como uma métrica para de significar alguma coisa.
--
-- ── A CHAVE NÃO MUDA; O RÓTULO MUDA ──────────────────────────────────────────────────
--
-- `chave` é o que fica gravado no lead, e é imutável de propósito: editar a chave de uma
-- categoria com trezentos casos gravados tornaria esses trezentos órfãos em silêncio. O
-- que a tela edita é `rotulo`, que é o que se lê. Renomear "Preço" para "Preço/condições"
-- corrige o histórico inteiro de uma vez, em vez de dividi-lo em dois.

create table if not exists crm_motivos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('perda','desqualificacao')),
  chave text not null,
  rotulo text not null,
  ajuda text,
  ordem int not null default 0,
  -- Motivo que o CÓDIGO escreve sozinho. Ver o gatilho no fim deste arquivo.
  protegido boolean not null default false,
  arquivado boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (tipo, chave)
);

create index if not exists crm_motivos_tipo on crm_motivos (tipo, ordem);

-- ─── O CHECK SAI ───
--
-- Ele listava as seis chaves. Mantê-lo faria a tela criar uma categoria que o banco
-- recusaria na hora de usá-la — o mesmo defeito de 'proposta_enviada', que custou meses.
-- Uma lista que a operação edita não pode ter cópia em constraint; quem valida agora é a
-- rota, contra esta tabela.
alter table leads drop constraint if exists leads_motivo_perda_categoria_check;

-- ─── AS SEIS QUE JÁ EXISTIAM ───
--
-- Entram como semente, com as MESMAS chaves, para que nada do que já está gravado perca o
-- nome. `sumiu` nasce protegido: é a varredura de follow-up que o escreve
-- (lib/followup/varredura.ts) e as métricas que o contam — apagá-lo faria o sistema
-- continuar gravando uma categoria que a tela não sabe mais nomear.
insert into crm_motivos (tipo, chave, rotulo, ajuda, ordem, protegido)
values
  ('perda','preco','Preço','O valor foi o impeditivo.',0,false),
  ('perda','outro_escritorio','Foi para outro escritório','Contratou concorrente.',1,false),
  ('perda','resolveu_sozinho','Resolveu sozinho','Seguiu sem assessoria.',2,false),
  ('perda','sumiu','Sumiu','Parou de responder. Escrito pela varredura de follow-up.',3,true),
  ('perda','perfil_dpu','Perfil DPU','Encaminhado à Defensoria — atendimento certo, não perda comercial.',4,false),
  ('perda','fora_de_escopo','Fora de escopo','Não é matéria do escritório.',5,false),
  ('desqualificacao','nao_era_caso','Não era caso','Não havia demanda jurídica.',0,false),
  ('desqualificacao','fora_do_perfil','Fora do perfil','Não é o público que o escritório atende.',1,false),
  ('desqualificacao','sem_contato','Não conseguimos contato','Tentamos e não houve resposta.',2,false)
on conflict (tipo, chave) do nothing;

-- ─── O QUE NÃO SE APAGA E O QUE NÃO SE RENOMEIA ───
--
-- A regra vale no lugar onde o estrago acontece, e não só na rota: toda edição de conta
-- até hoje neste projeto foi feita à mão no SQL Editor do Supabase (ver a migration 030).
-- Guarda em rota protege quem passa pela rota; o SQL Editor não passa.
create or replace function crm_motivos_protege() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    if old.protegido then
      raise exception 'O motivo "%" é escrito pelo próprio sistema e não pode ser apagado. Arquive-o se não quiser mais oferecê-lo.', old.chave;
    end if;
    return old;
  end if;

  if new.chave is distinct from old.chave then
    raise exception 'A chave de um motivo não muda: os casos já gravados com "%" ficariam órfãos. Edite o rótulo.', old.chave;
  end if;
  if old.protegido and new.arquivado and not old.arquivado then
    -- Arquivar o protegido é permitido: ele some do seletor e continua nomeando o
    -- histórico. O que não pode é sumir.
    return new;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists crm_motivos_protege_trg on crm_motivos;
create trigger crm_motivos_protege_trg
  before update or delete on crm_motivos
  for each row execute function crm_motivos_protege();
