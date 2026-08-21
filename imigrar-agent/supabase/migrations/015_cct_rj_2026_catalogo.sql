-- 015 — Pisos da CCT SIEMACO-RJ 2026/2027 no catálogo inteiro.
--
-- Contexto: as convenções coletivas das nove praças chegaram em 13/08/2026 (zip do Pedro
-- Provadelli). A do Rio foi lida cláusula por cláusula e conferida. A cláusula 3ª traz a
-- tabela de pisos por função; a cláusula 7ª diz o que fazer com quem não está na tabela
-- (função técnica ou de liderança pega o piso do encarregado, R$ 2.312,75; as demais, o
-- de servente, R$ 1.851,90). Com isso o catálogo inteiro passou a ter piso de verdade.
--
-- Isto SUBSTITUI a migration 013, que nunca deve ser rodada: os cinco valores dela eram
-- os placeholders redondos do seed do código (Porteiro 1.998,00, Zelador 2.050,00,
-- Recepcionista 2.100,00, Jardineiro 1.950,00, Operador de Piscina 2.000,00). O piso real
-- de portaria no Rio é R$ 2.051,95, e a CCT trata porteiro, vigia e zelador na mesma linha.
--
-- IMPORTANTE — esta migration é de SINCRONIA, não de comportamento. O motor já lê o piso
-- de lib/agent/cct.ts e não depende desta tabela para acertar o preço; ela existe para a
-- tela Comercial → Preços por função mostrar a mesma coisa que o motor calcula, e para o
-- veto do admin (desmarcar "preço confirmado") continuar funcionando função a função.
--
-- A coluna `beneficios` NÃO é tocada aqui, e é de propósito: ela não existe no schema
-- (004_setup_consolidado) e o repositório só a grava quando alguém rodou o ALTER à mão.
-- Era esse o outro defeito da migration 013 — ela escrevia `beneficios = 666.19` numa
-- coluna inexistente e teria falhado inteira. O Módulo 2.3 agora é calculado pela CCT da
-- praça (vale-transporte pela tarifa e pelo desconto de 6% da cláusula 22ª, refeição pelos
-- R$ 27,00/dia da cláusula 21ª, Benefício Social pelos R$ 22,70 da 27ª). Um valor fixo por
-- função sobrescreveria isso — inclusive na escala 12x36, que trabalha 15,21 dias/mês e
-- não 22, e por isso tem benefício menor que o 5x2.

-- A última coluna da lista, `por_fallback`, não é gravada: fica como registro de quais
-- pisos vieram da regra de enquadramento da cláusula 7ª em vez de uma linha nominal da
-- tabela da convenção. É a informação que o Pedro vai querer na hora de conferir.

-- 1) Insere ou atualiza o piso de cada função do catálogo.
insert into function_pricing
  (function_name, base_salary, schedule, uniforme_mes, equipamentos_func, material_func, price_confirmed, active, updated_at)
select v.nome, v.piso, v.escala, v.uniforme, 0, 0, true, true, now()
  from (values
  ('Auxiliar de Serviços Gerais', 1851.90, '5x2_44h', 46.97, false),
  ('Servente', 1851.90, '5x2_44h', 46.97, false),
  ('Faxineira', 1851.90, '5x2_44h', 46.97, false),
  ('Auxiliar de Limpeza', 1851.90, '5x2_44h', 46.97, false),
  ('Limpador', 1851.90, '5x2_44h', 46.97, false),
  ('Limpador de Vidro', 1851.90, '5x2_44h', 46.97, false),
  ('Limpador de Caixa d''Água', 1851.90, '5x2_44h', 46.97, false),
  ('Limpador de Fachada com Rapel', 2359.48, '5x2_44h', 46.97, false),
  ('Alpinista Predial', 2965.75, '5x2_44h', 46.97, false),
  ('Alpinista Industrial', 3309.62, '5x2_44h', 46.97, false),
  ('Operador de Máquina de Limpeza Tripulada', 2163.18, '5x2_44h', 46.97, false),
  ('Enfermeira Supervisora de Higienização', 4727.39, '5x2_44h', 46.97, false),
  ('Auxiliar de Dedetização', 1851.90, '5x2_44h', 46.97, false),
  ('Dedetizador sem Moto', 2111.61, '5x2_44h', 46.97, false),
  ('Dedetizador com Moto', 2201.94, '5x2_44h', 46.97, false),
  ('Porteiro', 2051.95, '12x36', 58.50, false),
  ('Auxiliar de Portaria', 1863.13, '12x36', 58.50, false),
  ('Porteiro/Vigia Terceirizado/Zelador', 2051.95, '12x36', 58.50, false),
  ('Vigia', 2051.95, '12x36', 58.50, false),
  ('Vigia Terceirizado com Moto', 2051.95, '12x36', 58.50, false),
  ('Controlador de Acesso', 2051.95, '12x36', 58.50, false),
  ('Operador de CFTV', 1851.90, '12x36', 58.50, false),
  ('Operador Central de Controle Operacional', 1851.90, '12x36', 58.50, false),
  ('Recepcionista', 1966.52, '5x2_44h', 58.50, false),
  ('Recepcionista Pleno (Bilíngue)', 3165.70, '5x2_44h', 58.50, false),
  ('Recepcionista Senior (Trilíngue)', 3819.40, '5x2_44h', 58.50, false),
  ('Auxiliar de Escritório', 2271.96, '5x2_44h', 58.50, false),
  ('Agente Administrativo', 2286.41, '5x2_44h', 58.50, false),
  ('Assistente Administrativo', 2158.74, '5x2_44h', 58.50, false),
  ('Assistente Administrativo Pleno', 2502.40, '5x2_44h', 58.50, false),
  ('Assistente Administrativo Senior', 2859.40, '5x2_44h', 58.50, false),
  ('Digitador', 2286.41, '5x2_44h', 58.50, false),
  ('Escriturário Datilógrafo', 2650.33, '5x2_44h', 58.50, false),
  ('Técnico em Secretariado', 2407.70, '5x2_44h', 58.50, false),
  ('Auxiliar de Secretaria', 2312.75, '5x2_44h', 58.50, true),
  ('Tramitador de Documentos', 1851.90, '5x2_44h', 58.50, false),
  ('Operador de Copiadora', 1851.90, '5x2_44h', 58.50, false),
  ('Operador de Serviço de Atendimento ao Usuário', 1851.90, '5x2_44h', 58.50, false),
  ('Contínuo', 1851.90, '5x2_44h', 58.50, false),
  ('Mensageiro', 1851.90, '5x2_44h', 58.50, false),
  ('Arrecadador', 1851.90, '5x2_44h', 58.50, false),
  ('Almoxarife', 2638.33, '5x2_44h', 58.50, false),
  ('Auxiliar de Almoxarife', 1966.52, '5x2_44h', 58.50, false),
  ('Zelador', 2051.95, '5x2_44h', 46.97, false),
  ('Auxiliar de Manutenção', 1851.90, '5x2_44h', 46.97, false),
  ('Jardineiro', 3035.56, '5x2_44h', 46.97, false),
  ('Auxiliar de Jardinagem', 1966.52, '5x2_44h', 46.97, false),
  ('Operador de Roçadeira', 1966.52, '5x2_44h', 46.97, false),
  ('Operador de Microtrator', 1966.52, '5x2_44h', 46.97, false),
  ('Operador de Moto Serra', 1966.52, '5x2_44h', 46.97, false),
  ('Eletricista', 2312.75, '5x2_44h', 46.97, true),
  ('Serralheiro', 2312.75, '5x2_44h', 46.97, true),
  ('Marceneiro', 2312.75, '5x2_44h', 46.97, true),
  ('Soldador', 2312.75, '5x2_44h', 46.97, true),
  ('Caldeireiro', 2312.75, '5x2_44h', 46.97, true),
  ('Ajustador Mecânico', 2312.75, '5x2_44h', 46.97, true),
  ('Mecânico de Máquinas', 2312.75, '5x2_44h', 46.97, true),
  ('Torneiro Mecânico', 2312.75, '5x2_44h', 46.97, true),
  ('Retificador', 2312.75, '5x2_44h', 46.97, true),
  ('Mandrilhador', 2312.75, '5x2_44h', 46.97, true),
  ('Ferramenteiro', 2312.75, '5x2_44h', 46.97, true),
  ('Fresador', 2312.75, '5x2_44h', 46.97, true),
  ('Eletromecânico', 2312.75, '5x2_44h', 46.97, true),
  ('Operador CNC', 2312.75, '5x2_44h', 46.97, true),
  ('Técnico de Automação', 2312.75, '5x2_44h', 46.97, true),
  ('Montador', 1851.90, '5x2_44h', 46.97, false),
  ('Auxiliar de Produção', 1966.52, '5x2_44h', 46.97, false),
  ('Ajudante de Armazém', 1851.90, '5x2_44h', 46.97, false),
  ('Auxiliar de Embalagem', 1851.90, '5x2_44h', 46.97, false),
  ('Operador de Empilhadeira', 2398.24, '5x2_44h', 46.97, false),
  ('Remanejador', 1851.90, '5x2_44h', 46.97, false),
  ('Triciclista', 1881.04, '5x2_44h', 46.97, false),
  ('Manobrista', 1966.52, '5x2_44h', 46.97, false),
  ('Auxiliar de Cozinha', 1851.90, '5x2_44h', 46.97, false),
  ('Cozinheira', 2516.28, '5x2_44h', 46.97, false),
  ('Cozinheira Escolar', 1851.90, '5x2_44h', 46.97, true),
  ('Chefe de Cozinha', 2745.00, '5x2_44h', 46.97, false),
  ('Copeira', 1851.90, '5x2_44h', 46.97, false),
  ('Garçom', 2638.33, '5x2_44h', 46.97, false),
  ('Manipulador de Alimentos', 1851.90, '5x2_44h', 46.97, true),
  ('Técnico de Nutrição', 1851.90, '5x2_44h', 46.97, true),
  ('Nutricionista', 1851.90, '5x2_44h', 46.97, true),
  ('Operador de Piscina', 1851.90, '5x2_44h', 46.97, true),
  ('Guardião de Piscina', 1851.90, '5x2_44h', 46.97, true),
  ('Supervisor de Piscina', 2312.75, '5x2_44h', 46.97, true),
  ('Salva-Vidas Civil', 1851.90, '5x2_44h', 46.97, true),
  ('Apoio Escolar', 1851.90, '5x2_44h', 46.97, false),
  ('Inspetor de Alunos', 2312.75, '5x2_44h', 46.97, true),
  ('Auxiliar de Educação Infantil', 1851.90, '5x2_44h', 46.97, true),
  ('Auxiliar de Ensino Fundamental', 1851.90, '5x2_44h', 46.97, true),
  ('Auxiliar de Ensino Médio', 1851.90, '5x2_44h', 46.97, true),
  ('Coordenador de Turno', 2312.75, '5x2_44h', 46.97, true),
  ('Coordenador Pedagógico', 2312.75, '5x2_44h', 46.97, true),
  ('Coordenador de Área', 2312.75, '5x2_44h', 46.97, true),
  ('Orientador Educacional', 1851.90, '5x2_44h', 46.97, true),
  ('Maqueiro', 1851.90, '5x2_44h', 46.97, false),
  ('Psicólogo', 2312.75, '5x2_44h', 46.97, true),
  ('Assistente Social', 2312.75, '5x2_44h', 46.97, true),
  ('Encarregado', 2312.75, '5x2_44h', 58.50, false),
  ('Supervisor', 4727.39, '5x2_44h', 58.50, false),
  ('Inspetor de Serviços', 2747.70, '5x2_44h', 58.50, false),
  ('Chefe de Departamento ou Seção', 3789.43, '5x2_44h', 58.50, false)
  ) as v(nome, piso, escala, uniforme, por_fallback)
on conflict (function_name) do update set
  base_salary = excluded.base_salary,
  schedule = excluded.schedule,
  uniforme_mes = excluded.uniforme_mes,
  equipamentos_func = 0,
  material_func = 0,
  price_confirmed = true,
  active = true,
  updated_at = now();

-- 2) Nenhuma função pode ficar com o piso zerado agora que a convenção está cadastrada.
-- Se sobrar alguma, é nome fora do catálogo e continua sob consulta — mas vale conferir.
-- select function_name from function_pricing where base_salary = 0;

-- Para desfazer (volta tudo a sob consulta, como estava antes de 13/08/2026):
-- update function_pricing set base_salary = 0, price_confirmed = false, updated_at = now()
--  where function_name <> 'Auxiliar de Serviços Gerais';
