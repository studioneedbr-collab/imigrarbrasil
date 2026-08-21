-- Seed do catálogo de serviços + configuração do agente (Fase 1)
-- Valores cost_per_employee / sale_price calculados pelo motor de preços (lib/agent/pricing.ts),
-- ancorados na planilha Shine Rio 2026 (ASG 5x2 44h = R$ 4.873,52/posto).

INSERT INTO services_catalog (name, category, base_salary, cost_per_employee, sale_price, margin_percent, schedule, description)
VALUES
 ('Auxiliar de Serviços Gerais','limpeza',1851.90,3930.10,4873.52,20,'5x2_44h','Limpeza e conservação (ASG)'),
 ('Porteiro','portaria',1998.00,8367.78,10376.48,20,'12x36','Controle de acesso e portaria'),
 ('Recepcionista','administrativo',2100.00,4361.08,5407.96,20,'5x2_44h','Recepção e atendimento'),
 ('Zelador','manutencao',2050.00,4274.22,5300.25,20,'5x2_44h','Zeladoria predial'),
 ('Jardineiro','manutencao',1950.00,4100.51,5084.84,20,'6x1_44h','Jardinagem e paisagismo'),
 ('Operador de Piscina','manutencao',2000.00,4187.37,5192.55,20,'5x2_44h','Guardião/operador de piscina')
ON CONFLICT DO NOTHING;

-- Configuração de preços (editável pelo admin). O system_prompt não é semeado aqui:
-- na ausência da chave, o app usa DEFAULT_SYSTEM_PROMPT (lib/agent/system-prompt.ts).
INSERT INTO agent_config (key, value) VALUES
 ('pricing', '{"bdi":0.24004,"beneficios_fixos":666.19,"uniforme":46.97}'::jsonb)
ON CONFLICT (key) DO NOTHING;
