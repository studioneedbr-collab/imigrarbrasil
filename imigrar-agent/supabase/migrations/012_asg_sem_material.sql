-- 012 — O posto não inclui material nem equipamento.
--
-- Apontado pelo Guido no teste de 10/08/2026: a Shayene disse ao cliente que o valor de
-- R$ 4.873,52 já vinha "com material incluso" e, quando ele pediu para tirar, ela
-- inventou um desconto (R$ 4.700).
--
-- Conferindo a planilha, o Módulo 5 (Insumos Diversos) da aba SERVENTE é:
--   uniforme 46,97 | equipamentos 0 | material 0 | TOTAL 46,97
-- e o subtotal A+B+C+D+E fecha em 3.930,10, que com o Módulo 6 (943,42) dá os 4.873,52.
-- Ou seja: o preço de referência é mão de obra, sem material e sem equipamento.
--
-- O cadastro do ASG carregava equipamentos 102,20 e material 391,18 (valores das abas
-- EQUIPAMENTOS e MATERIAL, que são orçamento avulso por escopo). O motor então calibrava
-- o BDI para trás em 10,17% para o total ainda bater nos 4.873,52 — o ASG fechava certo
-- por compensação, mas qualquer outra função sairia subprecificada assim que ganhasse
-- salário. Zerando os dois, o BDI volta a ser os 24,00% do Módulo 6 (custos indiretos 2%
-- + lucro 6% + tributos 12,81%), que é o que o agent_config já registrava como 0.24004.

update function_pricing
   set equipamentos_func = 0,
       material_func     = 0,
       updated_at        = now()
 where function_name = 'Auxiliar de Serviços Gerais';

-- Nenhuma outra função tem material ou equipamento embutido — quem pede isso vai para a
-- Mesa de Operação, que orça à parte (a variação de valor é grande demais para estimar).
update function_pricing
   set equipamentos_func = 0,
       material_func     = 0,
       updated_at        = now()
 where equipamentos_func <> 0
    or material_func <> 0;
