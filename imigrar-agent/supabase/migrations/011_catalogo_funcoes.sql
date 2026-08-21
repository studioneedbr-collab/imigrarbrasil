-- 011 — Catálogo completo de funções no motor de precificação.
--
-- Contexto: a planilha "COMPOSIÇÃO DE CUSTOS SHINE RIO 2026" fecha UMA única função
-- (Auxiliar de Serviços Gerais, aba SERVENTE: salário 1.851,90 -> venda 4.873,52). Não
-- há salário nem composição para nenhuma outra função — o próprio briefing responde
-- "Asg" quando perguntado o preço de venda por serviço.
--
-- O que esta migration faz:
--   1) Derruba o "preço confirmado" de qualquer função que não seja o ASG. Havia um
--      Porteiro marcado como confirmado com salário 1.998,00 — número placeholder que
--      veio do seed do código, não da planilha. Enquanto ficar assim, a Shayene passa
--      preço inventado de portaria para o cliente.
--   2) Cadastra as ~100 funções do catálogo oficial (RESUMO DO AGENTE COMERCIAL DE IA,
--      pergunta 1) como "sob consulta": sem salário, price_confirmed = false. A Shayene
--      passa a reconhecer a função e dizer que confirma o valor com o comercial.
--
-- uniforme_mes usa os dois únicos kits precificados na aba UNIFORME:
--   servente R$ 46,97/mês  |  porteiro/vigia (traje social) R$ 58,50/mês
-- equipamentos_func e material_func ficam zerados: os R$ 102,20 e R$ 391,18 da planilha
-- são o kit de limpeza dimensionado para aquele escopo, não valem para as outras funções.
--
-- Preencha o salário base e marque "preço confirmado" em Comercial → Preços por função
-- assim que o piso da CCT de cada categoria chegar.

-- 1) Só o ASG tem preço validado.
update function_pricing
   set price_confirmed = false,
       updated_at = now()
 where function_name <> 'Auxiliar de Serviços Gerais'
   and price_confirmed = true;

-- 1b) O Porteiro tinha sido cadastrado à mão com o salário 1.998,00 do seed do código.
-- Zera o salário (fica "a definir") e aplica o uniforme social da planilha.
update function_pricing
   set base_salary = 0,
       schedule = '12x36',
       uniforme_mes = 58.50,
       equipamentos_func = 0,
       material_func = 0,
       updated_at = now()
 where function_name = 'Porteiro';

-- 2) Catálogo oficial. on conflict do nothing: não sobrescreve o que já foi cadastrado
-- à mão na tela.
insert into function_pricing
  (function_name, base_salary, schedule, uniforme_mes, equipamentos_func, material_func, price_confirmed)
values
  ('Servente', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Faxineira', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Auxiliar de Limpeza', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Limpador', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Limpador de Vidro', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Limpador de Caixa d''Água', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Limpador de Fachada com Rapel', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Alpinista Predial', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Alpinista Industrial', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Operador de Máquina de Limpeza Tripulada', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Enfermeira Supervisora de Higienização', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Auxiliar de Dedetização', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Dedetizador sem Moto', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Dedetizador com Moto', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Porteiro', 0, '12x36', 58.50, 0, 0, false),
  ('Auxiliar de Portaria', 0, '12x36', 58.50, 0, 0, false),
  ('Porteiro/Vigia Terceirizado/Zelador', 0, '12x36', 58.50, 0, 0, false),
  ('Vigia', 0, '12x36', 58.50, 0, 0, false),
  ('Vigia Terceirizado com Moto', 0, '12x36', 58.50, 0, 0, false),
  ('Controlador de Acesso', 0, '12x36', 58.50, 0, 0, false),
  ('Operador de CFTV', 0, '12x36', 58.50, 0, 0, false),
  ('Operador Central de Controle Operacional', 0, '12x36', 58.50, 0, 0, false),
  ('Recepcionista', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Recepcionista Pleno (Bilíngue)', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Recepcionista Senior (Trilíngue)', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Auxiliar de Escritório', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Agente Administrativo', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Assistente Administrativo', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Assistente Administrativo Pleno', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Assistente Administrativo Senior', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Digitador', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Escriturário Datilógrafo', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Técnico em Secretariado', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Auxiliar de Secretaria', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Tramitador de Documentos', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Operador de Copiadora', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Operador de Serviço de Atendimento ao Usuário', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Contínuo', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Mensageiro', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Arrecadador', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Almoxarife', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Auxiliar de Almoxarife', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Zelador', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Auxiliar de Manutenção', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Jardineiro', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Auxiliar de Jardinagem', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Operador de Roçadeira', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Operador de Microtrator', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Operador de Moto Serra', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Eletricista', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Serralheiro', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Marceneiro', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Soldador', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Caldeireiro', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Ajustador Mecânico', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Mecânico de Máquinas', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Torneiro Mecânico', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Retificador', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Mandrilhador', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Ferramenteiro', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Fresador', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Eletromecânico', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Operador CNC', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Técnico de Automação', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Montador', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Auxiliar de Produção', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Ajudante de Armazém', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Auxiliar de Embalagem', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Operador de Empilhadeira', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Remanejador', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Triciclista', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Manobrista', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Auxiliar de Cozinha', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Cozinheira', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Cozinheira Escolar', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Chefe de Cozinha', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Copeira', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Garçom', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Manipulador de Alimentos', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Técnico de Nutrição', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Nutricionista', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Operador de Piscina', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Guardião de Piscina', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Supervisor de Piscina', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Salva-Vidas Civil', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Apoio Escolar', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Inspetor de Alunos', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Auxiliar de Educação Infantil', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Auxiliar de Ensino Fundamental', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Auxiliar de Ensino Médio', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Coordenador de Turno', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Coordenador Pedagógico', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Coordenador de Área', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Orientador Educacional', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Maqueiro', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Psicólogo', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Assistente Social', 0, '5x2_44h', 46.97, 0, 0, false),
  ('Encarregado', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Supervisor', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Inspetor de Serviços', 0, '5x2_44h', 58.50, 0, 0, false),
  ('Chefe de Departamento ou Seção', 0, '5x2_44h', 58.50, 0, 0, false)
on conflict (function_name) do nothing;

-- 3) O ASG continua sendo a única linha com preço validado (idempotente).
insert into function_pricing
  (function_name, base_salary, schedule, uniforme_mes, equipamentos_func, material_func, price_confirmed)
values
  ('Auxiliar de Serviços Gerais', 1851.90, '5x2_44h', 46.97, 102.20, 391.18, true)
on conflict (function_name) do update
  set base_salary       = excluded.base_salary,
      schedule          = excluded.schedule,
      uniforme_mes      = excluded.uniforme_mes,
      equipamentos_func = excluded.equipamentos_func,
      material_func     = excluded.material_func,
      price_confirmed   = true,
      updated_at        = now();
