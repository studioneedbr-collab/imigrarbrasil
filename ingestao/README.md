# Ingestão da base de conhecimento — Imigrar Brasil (Fase 2)

Transforma as 7 cartilhas em PDF na base vetorial que o agente consulta.
Python 3 puro (nenhuma dependência instalada por `pip`) + `poppler` para ler PDF.

```bash
brew install poppler          # fornece pdftotext e pdfinfo

python3 extrair.py            # PDF  -> out/paginas/*.json   (páginas limpas)
python3 chunk.py              # ->    out/chunks.jsonl       (chunks + metadados)
python3 validar.py            # relatório de qualidade + busca léxica local
python3 embed_upsert.py --estimativa    # tokens e custo, sem rede
python3 embed_upsert.py       # embeddings -> Supabase/pgvector
python3 buscar.py             # bateria de recuperação multilíngue
```

Cada etapa aceita filtro por fonte: `python3 extrair.py visto`, `python3 chunk.py legislacao`,
`python3 embed_upsert.py --fonte regularizacao`. Rodar parcial não apaga o resto —
`chunk.py` grava por fonte em `out/chunks/` e remonta o consolidado.

Antes do `embed_upsert.py`, aplicar `../imigrar-agent/supabase/migrations/017_rag_chunks.sql` no Supabase.

## O que sai disso

1.723 chunks. Nenhum abaixo de 180 caracteres, nenhum acima de ~2.340; mediana 1.207.

| fonte | coleção | chunks | estratégia |
|---|---|---:|---|
| legislacao | legislacao | 844 | 1 chunk por `Art. N`, com hierarquia Título > Capítulo > Seção |
| comentarios | doutrina | 567 | janela de parágrafos com sobreposição |
| mercosul | cartilha | 123 | janela de parágrafos |
| visto | cartilha | 48 | 1 chunk por pergunta |
| regularizacao | cartilha | 80 | 1 chunk por pergunta |
| naturalizacao | cartilha | 33 | 1 chunk por pergunta |
| refugio | cartilha | 28 | janela de parágrafos |

Custo de indexação completa: **US$ 0,08** com `text-embedding-3-large`. É irrelevante
no modelo de custo — o peso está em DeepSeek e transcrição, não aqui. Reindexar a cada
atualização de cartilha custa o mesmo valor.

## Decisões

**Chunking por família estrutural, não por número de caracteres.** As cartilhas da DPU
são perguntas e respostas: cada pergunta vira um chunk e o título do chunk *é* a pergunta,
que é a melhor âncora de recuperação possível. A legislação quebra em `Art. N` com a
hierarquia no metadado. O resto usa janela de parágrafos com sobreposição de um parágrafo.
Em nenhum caso cortamos no meio de um parágrafo.

**`texto_embed` leva um prefixo de contexto** (`documento — seção — título`). Sem ele,
um chunk que começa com "Sim, desde que a pessoa comprove..." não recupera nada. É o
mesmo motivo pelo qual o mapa de seções do `visto` importa: sem seção, quatro chunks
diferentes se chamam "Quais documentos são necessários?".

**Coleções separadas, e é a busca que prioriza.** `buscar.py` consulta só `cartilha` por
padrão — porque na bateria de teste a legislação e a doutrina, sendo 82% do acervo,
dominavam as respostas com texto legal bruto onde cabia linguagem acessível. Em produção
o agente deve consultar `cartilha` primeiro e só cair em `legislacao` quando precisar citar
o dispositivo.

**Da cartilha de refugiados indexamos só o bloco em português.** O PDF traz o mesmo
conteúdo em 5 idiomas em blocos sequenciais (PT 4-27, EN 30-53, FR 56-79, ES 82-105,
AR 108-132). As traduções são o mesmo texto e só competiriam entre si na recuperação —
a resposta em outro idioma vem do DeepSeek, não de um chunk traduzido. Como efeito
colateral, o problema de extração do árabe (o `pdftotext` embaralha a ordem RTL) sai do
caminho: nada em árabe é indexado.

**Busca híbrida no SQL.** Vetorial (multilíngue, cruza idioma) fundida por RRF com busca
textual em português (acerta termo jurídico exato, onde o embedding erra). Peso 1,0 para
a vetorial e 0,5 para a textual.

**Dimensão 1024** serve aos três modelos citados no documento do projeto: BGE-M3,
multilingual-e5-large e text-embedding-3-large (truncado). Trocar de modelo obriga a
reindexar tudo — daí o custo acima ser um número que vale reler.

## Achados que afetam o contrato

**A cartilha do Mercosul (maio/2010) e a de refugiados (novembro/2010) são anteriores à
Lei de Migração (13.445/2017).** São 151 chunks — 9% do acervo — descrevendo um regime
revogado. Estão marcados com `alerta_desatualizacao` e o agente precisa tratar esse campo:
ou não usar esses chunks para resposta operacional, ou responder com ressalva explícita.
Isso não é ajuste fino de prompt, é risco jurídico do item 9 da proposta. Vale pedir ao
cliente as versões atuais desses dois materiais antes do piloto.

As demais: cartilhas da DPU de fevereiro/2022, cartilha de visto de dezembro/2020,
compilação de legislação de fevereiro/2018.

## Limitações conhecidas

- **`visto` depende de um mapa manual de seções** (`secoes_manuais` em `fontes.json`).
  As divisórias dessa cartilha estão rasterizadas e não existem no texto do PDF. O mapa
  foi ancorado pela ordem do sumário, que confere com a ordem do corpo. Se o cliente
  trocar o PDF, reconferir com `python3 -c "..."` sobre `out/chunks/visto.jsonl`.
- **A extração ainda deixa passar erros do PDF** (`apr esente` no lugar de `apresente`,
  em palavras que o layout justificado separou). São raros e não atrapalham a busca, mas
  aparecem se um trecho for citado literalmente ao usuário.
- **`validar.py` usa BM25, que não cruza idioma.** As consultas em ES/EN/FR/HT vão falhar
  ali por construção — é teste de corte, não de recuperação. A validação multilíngue de
  verdade é `buscar.py`, que exige a base carregada.
- **Nada aqui foi executado contra o Supabase real** — falta o projeto e as credenciais.
  `embed_upsert.py` e `buscar.py` estão escritos, mas rodados só até `--estimativa`.

## Como manter

A base tem prazo de validade. Regra migratória muda por portaria e a atualização não é
responsabilidade técnica — é do responsável do lado do cliente (item 8.3 da proposta).
O ciclo é: trocar o PDF na raiz do projeto, ajustar `atualizado_em` em `fontes.json`,
rodar `extrair.py <fonte> && chunk.py <fonte> && embed_upsert.py --fonte <fonte>`.
Os ids dos chunks são derivados do conteúdo, então o `upsert` substitui o que mudou —
mas **chunks que sumiram do PDF novo continuam na base**. Ao trocar uma cartilha inteira,
apagar antes: `delete from rag_chunks where fonte = '<fonte>';`
