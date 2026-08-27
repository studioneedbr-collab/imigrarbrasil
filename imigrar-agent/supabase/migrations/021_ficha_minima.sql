-- 021 — A FICHA MÍNIMA.
--
-- A análise de uma conversa real mostrou o buraco: a Ana transferiu um caso ao time
-- jurídico com quatro campos preenchidos e sem o nome da pessoa. Quem abriu a ficha não
-- tinha o que ler, e quem ligou não sabia com quem estava falando.
--
-- Duas coisas faltavam no modelo, e nenhuma delas cabia nos campos que já existiam:
--
-- 1. O RELÓGIO DO CASO. `tem_prazo_correndo` é prazo PROCESSUAL — multa, indeferimento,
--    notificação de saída — e joga o lead no bloco de prioridade máxima da fila. Mas todo
--    caso tem um relógio: as aulas que começam em março, o contrato que assina em junho,
--    o passaporte que vence, o CRNM que expira. Enfiar isso em `prazo_tipo` afogaria quem
--    tem defesa a protocolar em quem tem matrícula a fazer. Por isso é uma coluna própria,
--    de texto livre, sem data calculada: a frase da pessoa, para quem for pegar o caso.
--
-- 2. A INTENÇÃO DECLARADA. O time perde tempo com quem nunca teve intenção de contratar.
--    Perguntar "posso pedir para o time te orientar?" não separa nada — todo mundo aceita
--    ajuda de graça. O que separa é perguntar se a pessoa prefere tocar o processo sozinha
--    ou que o escritório cuide. A resposta a essa pergunta passa a ser um campo.
--
-- Nenhuma das duas colunas aceita data. Data de prazo continua vindo de gente, com nome
-- de quem confirmou — ver a migration 019.

alter table leads add column if not exists relogio_do_caso text;

alter table leads add column if not exists intencao text
  check (intencao is null or intencao in ('contratar', 'sozinho', 'sem_condicoes'));

comment on column leads.relogio_do_caso is
  'O que pressiona este caso e quando, na frase da pessoa (início das aulas, vencimento de passaporte ou CRNM, chegada de familiar). Texto livre, nunca data calculada. Prazo PROCESSUAL fica em tem_prazo_correndo/prazo_tipo.';

comment on column leads.intencao is
  'Resposta ao teste de intenção: contratar (quer que o escritório cuide), sozinho (quer tocar por conta com orientação) ou sem_condicoes (perfil de gratuidade, encaminhado à DPU).';

-- Quem abre a fila de manhã quer ver primeiro quem quer contratar. Índice parcial: as
-- outras duas respostas não entram na fila e não precisam ser indexadas.
create index if not exists leads_intencao_contratar_idx
  on leads (updated_at desc)
  where intencao = 'contratar';
