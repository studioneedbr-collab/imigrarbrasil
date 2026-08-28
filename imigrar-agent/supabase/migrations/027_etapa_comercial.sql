-- 027 — A ETAPA ONDE O DINHEIRO APARECE, E O DESFECHO QUE SE SOMA.
--
-- O quadro ia de "em atendimento" direto para "reunião agendada". O fluxo real do
-- escritório tem um passo entre os dois: alguém assume, ENVIA O ORÇAMENTO e só então
-- marca a reunião. A etapa em que a proposta está com o cliente não existia — e é
-- justamente a que mais precisa de follow-up, porque é a única em que o silêncio da
-- pessoa custa dinheiro e tem data de validade.
--
-- Três coisas eram invisíveis e passam a existir:
--   · PROPOSTA ENVIADA — quantas estão em aberto, de quanto, de qual serviço, até quando.
--   · FECHADO com valor — sem isso dá para contar casos fechados e não dá para dizer
--     quanto valeram. Nulo continua sendo legítimo: nem todo caso fechado vira contrato.
--   · PERDIDO com categoria — "sumiu", "não respondeu" e "parou de responder" são a mesma
--     coisa escrita de três jeitos, e nenhuma métrica soma texto livre. A frase continua
--     existindo ao lado da categoria, porque é ela que se lê seis meses depois.

-- ─── O NOVO STATUS ───
--
-- `atendimento_status` é texto sem check na tabela `leads`, então não há constraint a
-- alterar aqui. O check que EXISTE é o de `crm_etapas.status`, e é ele que impediria o
-- escritório de criar uma coluna comercial no próprio quadro.
alter table crm_etapas drop constraint if exists crm_etapas_status_check;
alter table crm_etapas add constraint crm_etapas_status_check
  check (status in ('novo','em_atendimento','proposta_enviada','agendado','fechado','perdido'));

-- ─── O QUE O CARD GUARDA EM "PROPOSTA ENVIADA" ───
--
-- Tudo de humano. O agente NUNCA escreve aqui (ver CAMPOS_SO_DE_HUMANO em
-- lib/data/prazo.ts): um modelo inferindo "acho que ficou uns três mil" de uma frase do
-- cliente estaria escrevendo receita no painel do escritório.
alter table leads add column if not exists proposta_enviada_em timestamptz;
alter table leads add column if not exists proposta_valor numeric(12,2);
alter table leads add column if not exists proposta_servico text;
alter table leads add column if not exists proposta_validade date;

-- ─── O DESFECHO ───
alter table leads add column if not exists valor_contratado numeric(12,2);
alter table leads add column if not exists motivo_perda_categoria text;

alter table leads drop constraint if exists leads_motivo_perda_categoria_check;
alter table leads add constraint leads_motivo_perda_categoria_check
  check (motivo_perda_categoria is null or motivo_perda_categoria in
    ('preco','outro_escritorio','resolveu_sozinho','sumiu','perfil_dpu','fora_de_escopo'));

-- Proposta em aberto é o que a tela de follow-up vai procurar todo dia: quem está
-- esperando resposta, há quanto tempo, e de quem a validade já venceu.
create index if not exists leads_proposta_aberta
  on leads (proposta_enviada_em) where atendimento_status = 'proposta_enviada';

-- ─── A COLUNA NO FUNIL PADRÃO ───
--
-- Entra ENTRE "em atendimento" e "reunião agendada", que é onde ela acontece no
-- escritório. As etapas seguintes empurram a ordem; sem isso a coluna nova nasceria no
-- fim do quadro, depois de "perdido", e ninguém a usaria.
--
-- Só mexe no funil que a migration 026 criou (o padrão) e só se ele ainda não tiver uma
-- etapa comercial: quadro que o escritório já redesenhou não se reescreve por migration.
do $$
declare v_funil uuid;
begin
  select id into v_funil from crm_funis where padrao and not arquivado limit 1;
  if v_funil is null then return; end if;
  if exists (select 1 from crm_etapas where funil_id = v_funil and status = 'proposta_enviada') then
    return;
  end if;

  update crm_etapas set ordem = ordem + 1
   where funil_id = v_funil and ordem >= 2;

  insert into crm_etapas (funil_id, nome, ajuda, status, ordem)
  values (v_funil, 'Proposta enviada', 'O orçamento está com a pessoa, esperando resposta.', 'proposta_enviada', 2);
end $$;
