-- 031 — POR ONDE O CASO CHEGOU.
--
-- Até aqui havia uma porta só: o WhatsApp. O painel não guardava a origem porque não
-- havia o que distinguir — e no dia em que passam a existir três (o formulário do site, a
-- carga inicial da planilha e o cadastro à mão), a falta dela contamina tudo de uma vez:
-- cem casos importados de uma planilha entram no funil no mesmo dia e a captação do mês
-- passa a parecer dez vezes maior do que foi, sem ninguém ter mentido em lugar nenhum.
--
-- O DEFAULT É 'whatsapp', e é isso que também marca as linhas antigas. Não é chute: até
-- esta migration, a única forma de um lead existir era uma mensagem chegar pelo webhook.
-- Deixá-las nulas seria trocar um fato conhecido por um buraco, e buraco em coluna de
-- filtro vira uma opção "sem origem" que ninguém sabe o que quer dizer.
--
-- O DETALHE (qual formulário, qual planilha, quem cadastrou) continua em `notes`, em
-- texto. São perguntas diferentes: a coluna responde "de que porta veio" e serve a
-- filtro e a contagem; a nota responde "o que exatamente aconteceu" e serve a quem lê.

alter table leads add column if not exists origem text not null default 'whatsapp';

alter table leads drop constraint if exists leads_origem_check;
alter table leads add constraint leads_origem_check
  check (origem in ('whatsapp','site','importacao','manual'));

-- O filtro do quadro pergunta por origem dentro de um funil. Sem índice isso é varredura
-- na tabela inteira a cada clique.
create index if not exists idx_leads_origem on leads (origem);
