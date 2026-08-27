-- 022 — A DATA DO RELÓGIO DO CASO.
--
-- A 021 criou `relogio_do_caso` como texto livre: "as aulas começam em março", "o
-- passaporte vence em julho". Resolveu o problema de a conversa terminar sem ninguém
-- saber o que corre contra o caso, e criou outro.
--
-- PRAZO MOLE VIRA DURO. "Aulas começam em março" é tranquilo em novembro e é emergência
-- em fevereiro, e com texto puro ninguém percebe a virada: a frase na ficha continua
-- exatamente igual enquanto a coisa que ela descreve muda de natureza. Quem varre a fila
-- de manhã não tem como ver isso, e o caso só reaparece quando a pessoa volta a escrever
-- — se voltar.
--
-- Daí esta coluna: a data, quando alguém do time consegue apurá-la. Duas regras.
--
-- 1. É DE HUMANO. O agente NUNCA escreve aqui, pelo mesmo motivo das datas de prazo
--    processual (ver 019): a pessoa raramente sabe a data de cabeça, e um contador em
--    cima de data inferida pelo modelo é como se perde um prazo. A trava não é
--    convenção: `upsertLead`, o caminho do agente, descarta o campo. Ver lib/data/prazo.ts.
--
-- 2. NÃO É PRAZO PROCESSUAL. Um relógio apertado sobe o lead dentro da fila NORMAL e
--    ganha marcador — não liga `tem_prazo_correndo`, não entra no bloco de prazos e não
--    usa a cor do prazo. Aquele bloco é de multa, indeferimento e notificação de saída;
--    encher de matrícula de faculdade é como ele deixa de ser levado a sério.

alter table leads add column if not exists relogio_data date;

comment on column leads.relogio_data is
  'Data do relógio do caso (início das aulas, vencimento de passaporte ou CRNM, chegada de familiar), quando alguém do time consegue apurá-la. SEMPRE preenchida por humano — o agente não escreve nesta coluna. Não é prazo processual: não liga tem_prazo_correndo nem entra no bloco de prazos.';

-- A fila normal lê esta coluna para subir quem está apertado. Índice parcial: linha sem
-- data não muda de posição e não precisa ser indexada.
create index if not exists leads_relogio_data_idx
  on leads (relogio_data)
  where relogio_data is not null;
