# Tradução da conversa no painel

Desenho aprovado em 28/08/2026.

## O problema

A Ana atende em onze idiomas e responde na língua de quem escreveu. Isso é certo para o
cliente e cria um problema do lado de dentro: quando o Walter abre uma conversa em
espanhol, ele precisa ler o caso numa língua que não é a dele — e não é só o que o
cliente escreveu, é também o que a Ana respondeu. Metade do diálogo, no mínimo, é
ilegível para quem vai decidir o caso.

A tela hoje já sabe o idioma e diz `fala espanhol` num selo
([page.tsx:477](../../../imigrar-agent/app/dashboard/conversations/[id]/page.tsx#L477)).
Ela sabe e não ajuda.

## O escopo, e o que fica de fora

**Só leitura.** A tradução existe para o time entender a conversa. Nada do que for
traduzido é enviado a ninguém.

**Fica de fora, de propósito:** traduzir o que o atendente escreve para o cliente. Esse
outro caminho põe texto de máquina no WhatsApp de alguém em situação irregular, sem
revisão de quem sabe a língua. É uma decisão maior, e não é esta.

Consequência boa do recorte: tradução ruim aqui não causa dano — no máximo alguém relê o
original, que continua na tela.

## Como funciona

### Quando

Ao **abrir a conversa**, e guarda. Só se traduz o que alguém foi ler; a segunda abertura
não custa nada. Conversa que ninguém abre não gera chamada nenhuma.

As duas alternativas descartadas, e por quê:

- **Traduzir e não guardar** — cada abertura paga de novo por um texto idêntico.
- **Traduzir na chegada, no webhook** — pagaria pela conversa que ninguém lê, e somaria
  segundos ao tempo de resposta da Ana, que hoje é de 7 segundos ponta a ponta.

### O módulo

`lib/agent/traducao.ts`, no formato dos que já existem
([vision.ts](../../../imigrar-agent/lib/agent/vision.ts),
[idioma-modelo.ts](../../../imigrar-agent/lib/agent/idioma-modelo.ts)):

- recebe uma lista de textos e o idioma de origem, devolve as traduções em português;
- **uma chamada para a conversa inteira**, não uma por mensagem. O custo é dominado pelo
  tamanho do prompt: vinte chamadas de uma linha custam muito mais que uma de vinte;
- registra em `chamadas_llm` via `registrarChamada`, como todo o resto;
- provedor: DeepSeek, que já está ligado e pago.

A saída do modelo vem indexada (cada texto numerado), e o módulo confere que voltou a
mesma quantidade que entrou. Se não voltar, a tradução daquela leva é descartada inteira
— emparelhar tradução com a mensagem errada é pior do que não traduzir, porque parece
certo.

### O banco

Migration `027`:

- `messages.traducao_pt text` — a tradução daquela mensagem, ou nulo;
- `'traducao'` entra na constraint de `chamadas_llm.tipo`, hoje limitada a
  `redacao / extracao / classificacao / transcricao / embedding`
  ([024_custo_e_vocabulario.sql](../../../imigrar-agent/supabase/migrations/024_custo_e_vocabulario.sql)).
  Sem isso o insert falha ou o custo entra disfarçado de outra coisa, e a tela de
  Métricas passa a mentir. `TIPOS_DE_CHAMADA` e o mapa de rótulos acompanham.

### O caminho na tela

1. A página abre **na hora**, com os originais, como hoje.
2. Um pedido em segundo plano — `POST /api/conversations/[id]/traducao` — traduz só as
   mensagens sem `traducao_pt`, salva e devolve o mapa `id → tradução`.
3. As traduções aparecem embaixo de cada balão, um instante depois.
4. Na segunda abertura elas já vêm do banco com a mensagem, e nenhuma chamada acontece.

Assíncrono porque a abertura da conversa é justamente o momento em que alguém está com
pressa; esperar o modelo para pintar a tela troca um problema por outro.

**Gatilho:** só quando `conversation.idioma` existe e não é `pt`. Sem idioma detectado, o
sistema não inventa — é a mesma regra conservadora de
[idioma.ts](../../../imigrar-agent/lib/agent/idioma.ts), onde palpite errado gruda no
contato.

**O que se traduz:** todas as mensagens da conversa, do cliente **e** da Ana. Áudio e
anexo já chegam como texto (transcrição, leitura de documento) e caem na mesma regra.
Mensagem vazia ou sem texto é pulada.

### Como aparece

Abaixo do balão original, num bloco menor e apagado, com um rótulo curto: *tradução
automática*.

**O original nunca é substituído nem escondido.** É um caso de imigração: o que a pessoa
escreveu é a fonte, a tradução é leitura de apoio, e um dia alguém vai precisar conferir a
palavra exata. O rótulo existe pelo mesmo motivo — quem lê tem de saber, sem pensar, que
aquilo é máquina e não a pessoa.

### Quando falha

O original continua lá, aparece uma linha discreta dizendo que não deu para traduzir, e um
botão de tentar de novo. Nada trava, nada some, a conversa segue legível na língua
original. Falha de tradução não pode ser motivo de conversa que não abre.

## Testes

`lib/agent/traducao.ts`, com o modelo mockado:

- traduz uma leva e devolve na ordem que entrou;
- resposta do modelo com quantidade diferente da entrada → descarta a leva;
- resposta malformada → descarta, sem lançar;
- registra a chamada em `chamadas_llm` com `tipo: 'traducao'`.

`POST /api/conversations/[id]/traducao`:

- exige sessão (é dado de cliente);
- traduz **só** o que está sem `traducao_pt`;
- conversa já traduzida por inteiro não gera chamada nenhuma;
- conversa em português não gera chamada nenhuma.
