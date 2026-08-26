# Material oficial

As sete fontes que sustentam tudo que o agente afirma sobre imigração. **Fora daqui ele
não responde**: o prompt manda dizer que não tem a informação e encaminhar ao time
jurídico. Inventar regra migratória é o único erro grave que existe neste sistema — a
pessoa do outro lado toma decisão de vida com o que ler.

| arquivo | fonte em `ingestao/fontes.json` | órgão | atualizado |
|---|---|---|---|
| `regularizacao-migratoria.pdf` | `regularizacao` | DPU / OIM | 2022-02 |
| `naturalizacao-dpu.pdf` | `naturalizacao` | DPU | 2022-02 |
| `emissao-de-visto.pdf` | `visto` | DPU | 2020-12 |
| `mercosul-trabalho.pdf` | `mercosul` | MTE / Mercosul | 2010-05 ⚠️ |
| `refugiados-no-brasil.pdf` | `refugio` | ACNUR / CONARE | 2010-11 ⚠️ |
| `legislacao-migratoria.pdf` | `legislacao` | OAB/RS | 2018-02 |
| `comentarios-lei-migracao.pdf` | `comentarios` | doutrina | 2020-03 |

⚠️ **As duas cartilhas de 2010 são anteriores à Lei de Migração 13.445/2017.** Continuam
indexadas porque a parte prática (onde ir, o que levar, como é o atendimento) segue útil,
mas `fontes.json` marca as duas com `alerta_desatualizacao` — confira contra a legislação
vigente antes de qualquer resposta operacional.

## Trocar uma fonte

O nome do arquivo é o contrato: `<id da fonte>.pdf`. Para atualizar uma cartilha,
substitua o arquivo de mesmo nome, ajuste `atualizado_em` e as faixas de `paginas` em
`ingestao/fontes.json` e rode a ingestão de novo (`ingestao/README.md`).

Cuidado com um detalhe documentado lá: reindexar **não apaga** os chunks antigos. Ao
trocar uma cartilha, limpe os chunks daquela fonte antes de subir os novos, ou o agente
vai citar as duas versões ao mesmo tempo.
