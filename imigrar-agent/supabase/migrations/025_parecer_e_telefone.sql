-- 025 — O QUE A ANA NÃO PODE DIZER, E QUEM É A MESMA PESSOA.
--
-- Duas correções que vieram da leitura de conversas reais, não de um relatório de bug.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PARECER BARRADO — o verificador de saída precisa de onde reclamar.
--
-- Numa conversa real a Ana escreveu, em espanhol, que ter o passaporte carimbado em
-- Pacaraima "es buena señal: significa que tu entrada quedó registrada de forma regular".
-- Isso é análise do caso concreto, que o prompt proíbe em todas as versões — e é pior do
-- que uma resposta errada qualquer: é um escritório de advocacia afirmando a uma pessoa
-- que a entrada dela é REGULAR. Se estiver errado, ela decide a vida em cima disso.
--
-- lib/agent/verificador-de-saida.ts corta a frase antes de a mensagem sair. O corte não
-- pode ser silencioso: se a Ana está tentando dar parecer com frequência, isso é um
-- defeito do prompt, e ninguém vai descobrir isso lendo log de servidor.
-- ─────────────────────────────────────────────────────────────────────────────
-- A lista de tipos é a da 024 (que renomeou `deepseek_falhou` para `llm_falhou`) mais
-- este. Repetir a lista inteira é chato e é o certo: um `check` não se acrescenta em
-- pedaços, e escrever só o valor novo apagaria os outros quatro em silêncio.
alter table eventos_operacao drop constraint if exists eventos_operacao_tipo_check;
alter table eventos_operacao add constraint eventos_operacao_tipo_check
  check (tipo in ('transcricao_falhou', 'llm_falhou', 'documento_falhou', 'parecer_barrado'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O MESMO TELEFONE É A MESMA PESSOA.
--
-- Ana Rodríguez apareceu duas vezes na fila e duas vezes no quadro: uma como
-- "Venezuela · Modalidade a definir" em EM ATENDIMENTO, outra como "venezolana · Saber
-- qué hacer con una multa migratoria" em NOVO. Mesma pessoa, dois registros, duas fichas
-- pela metade — e o time atendendo cada uma sem saber da outra.
--
-- `whatsapp_number` já tem unique, então a duplicata NÃO veio de duas linhas com o mesmo
-- texto: veio de duas GRAFIAS do mesmo número. "5595...", "+5595...", com e sem o nono
-- dígito, com espaço, com hífen — cada variação abre uma conversa nova.
--
-- Esta coluna guarda a forma canônica (ver lib/whatsapp/telefone.ts) e é por ela que o
-- repositório procura antes de criar. Não é unique de propósito: um contato que ficou
-- meses parado e voltou merece registro novo, e a janela de reaproveitamento é regra de
-- domínio (lib/whatsapp/telefone.ts), não de banco.
-- ─────────────────────────────────────────────────────────────────────────────
alter table conversations add column if not exists telefone_normalizado text;

comment on column conversations.telefone_normalizado is
  'Forma canônica do whatsapp_number (só dígitos, DDI, sem o nono dígito variável). É por aqui que se descobre que duas conversas são da mesma pessoa.';

create index if not exists idx_conversations_telefone
  on conversations (telefone_normalizado, updated_at desc)
  where telefone_normalizado is not null;

-- Retroativo: as conversas que já existem passam a ter a forma canônica. A expressão
-- abaixo é a mesma de `normalizarTelefone`, na parte que dá para fazer em SQL — tira tudo
-- que não é dígito e ignora os números do simulador (`sim:...`), que não são telefone.
update conversations
   set telefone_normalizado = regexp_replace(whatsapp_number, '[^0-9]', '', 'g')
 where telefone_normalizado is null
   and whatsapp_number not like 'sim:%'
   and regexp_replace(whatsapp_number, '[^0-9]', '', 'g') <> '';
