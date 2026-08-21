-- 013 — Piso da CCT RJ 2026 para as cinco funções mais pedidas.
--
-- ⛔ OBSOLETA — NÃO RODE. Substituída pela migration 015, de 13/08/2026.
--
-- Ficou aqui só como registro. Dois motivos para nunca ser aplicada:
--   1. Os cinco valores abaixo eram placeholders, não pisos. A CCT SIEMACO-RJ 2026/2027
--      chegou em 13/08/2026 e os pisos reais são outros — porteiro é R$ 2.051,95, e não
--      R$ 1.998,00; recepcionista é R$ 1.966,52, e não R$ 2.100,00.
--   2. Ela escreve na coluna `beneficios`, que não existe em function_pricing
--      (ver 004_setup_consolidado) — a migration falharia inteira já na primeira linha.
--
-- ⚠️ NÃO APLICADA EM PRODUÇÃO. Rode só depois de conferir os pisos na convenção.
--
-- POR QUE ESTÁ SEGURANDO: estes cinco salários são idênticos, centavo por centavo, aos
-- placeholders que estavam em lib/agent/catalog.ts, cujo próprio comentário dizia
-- "baseSalary das não-confirmadas é placeholder":
--     Porteiro 1.998,00 · Zelador 2.050,00 · Recepcionista 2.100,00
--     Jardineiro 1.950,00 · Operador de Piscina 2.000,00
-- Foi um deles (Porteiro, 1.998,00, marcado como confirmado) que fez a Shayene passar
-- preço de portaria inventado ao cliente em 10/08/2026 — o que a migration 011 corrigiu.
-- Piso de CCT real raramente é redondo: o do ASG é 1.851,90.
--
-- Com price_confirmed = true, estes valores passam a sair em proposta em PDF assinável.
-- Confira cada um na convenção vigente do sindicato antes de rodar isto.
--
-- Enquanto não rodar, produção continua correta: as cinco ficam sob consulta e a Shayene
-- não passa valor para elas (o guardrail do prompt cuida da conversa).

update function_pricing set
  base_salary = 1998.00, schedule = '12x36', beneficios = 666.19,
  uniforme_mes = 58.50, equipamentos_func = 0, material_func = 0,
  price_confirmed = true, updated_at = now()
 where function_name = 'Porteiro';

update function_pricing set
  base_salary = 2050.00, schedule = '5x2_44h', beneficios = 666.19,
  uniforme_mes = 46.97, equipamentos_func = 0, material_func = 0,
  price_confirmed = true, updated_at = now()
 where function_name = 'Zelador';

update function_pricing set
  base_salary = 2100.00, schedule = '5x2_44h', beneficios = 666.19,
  uniforme_mes = 46.97, equipamentos_func = 0, material_func = 0,
  price_confirmed = true, updated_at = now()
 where function_name = 'Recepcionista';

update function_pricing set
  base_salary = 1950.00, schedule = '6x1_44h', beneficios = 666.19,
  uniforme_mes = 46.97, equipamentos_func = 0, material_func = 0,
  price_confirmed = true, updated_at = now()
 where function_name = 'Jardineiro';

update function_pricing set
  base_salary = 2000.00, schedule = '5x2_44h', beneficios = 666.19,
  uniforme_mes = 46.97, equipamentos_func = 0, material_func = 0,
  price_confirmed = true, updated_at = now()
 where function_name = 'Operador de Piscina';

-- Para desfazer, se um piso vier errado:
-- update function_pricing set base_salary = 0, price_confirmed = false, updated_at = now()
--  where function_name in ('Porteiro','Zelador','Recepcionista','Jardineiro','Operador de Piscina');
