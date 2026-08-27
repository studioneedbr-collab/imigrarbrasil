# Suíte de recuperação (RAG)

```bash
npm run test:rag        # NÃO entra no npm test — ver vitest.rag.config.ts
```

Os 500 testes de `npm test` cobrem o prompt. Nenhum cobria o RAG, e é o RAG que decide o
que a Ana pode afirmar: o prompt manda ela responder **exclusivamente** pelo material
recuperado. Uma regressão de recuperação não aparece vermelha — aparece como a Ana
dizendo "não tenho essa informação" para uma pergunta que a cartilha responde inteira.
Entre duas mudanças de prompt, ninguém repara.

## Dois modos, e por quê

| arquivo | o que mede | precisa de |
|---|---|---|
| `corpus.recall.ts` | o chunk esperado **ainda existe**, com o mesmo id e a mesma âncora | `ingestao/out/chunks.jsonl` (local, sem rede) |
| `indice.recall.ts` | o chunk esperado **é recuperado** no top-6 de produção | Supabase + chave de embeddings + base indexada |

O id do chunk é derivado do conteúdo (`ingestao/chunk.py`). Trocar um PDF, mexer no
chunking ou alterar a faixa de páginas em `fontes.json` muda os ids em silêncio — e o
modo corpus é o que grita. Ele roda sem segredo nenhum:

```bash
cd ../ingestao && python3 extrair.py && python3 chunk.py
```

O modo índice **falha em vez de pular** quando a base não está configurada. Uma suíte de
recuperação que se auto-pula vira verde permanente, e verde permanente é como ninguém
percebe que o agente está atendendo sem material oficial.

## Os casos

`casos.ts`. Cada um tem a consulta como ela chega de gente, os ids aceitáveis, a âncora
legível e o que uma resposta correta precisa conter. `lacuna` marca onde o acervo **não**
responde direito: o caso continua rodando contra o melhor chunk de hoje e a lacuna sai no
relatório, para não virar folclore oral.

Ao adicionar um caso: escreva a consulta com as palavras de quem pergunta, não com as do
documento. "Boliviano precisa de visto" e "nacionais do Mercosul dispensa de visto" são o
mesmo caso para quem indexou e são casos diferentes para quem recupera — e é o primeiro
que chega pelo WhatsApp.
