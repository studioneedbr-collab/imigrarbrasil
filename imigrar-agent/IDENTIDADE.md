# Identidade visual — Imigrar Brasil

## Cores

Nenhuma cor foi inventada. Todas saíram do logotipo do cliente
(`public/marca/logotipo-original.png`), amostradas pixel a pixel:

| token | hex | de onde veio | papel |
|---|---|---|---|
| `ib-selo` | `#009687` | a moldura em L e a palavra BRASIL — 54% da arte | **identidade**: marca, item ativo, agente no ar |
| `ib-mar` | `#005EC4` | a palavra IMIGRAR | **ação**: botão, link, anel de foco |
| `ib-carimbo` | `#235A9C` | o quarto de círculo | tom médio, degradês, chips |
| `ib-casa` | `#12335C` | o navy aprofundado | rail e títulos |
| `ib-bruma` | `#CCECFB` | o arco interno | seleção, tinta de destaque |
| `ib-papel` | `#F1F6FA` | branco resfriado para a bruma | chão da página |
| `ib-ink` | `#0D1B2C` | — | texto |
| `ib-line` `ib-slate` | `#DBE6F0` `#54677E` | — | traço e texto secundário |
| `ib-success` | `#0F8A5F` | — | ver nota abaixo |
| `ib-warn` `ib-danger` | `#C1740E` `#C42C2C` | — | alerta e erro |

**A regra que organiza tudo: teal é identidade, azul é ação.** No logotipo o teal é a
massa e o azul é o verbo. No painel o teal marca o que a Imigrar Brasil *é*; o azul
marca o que a pessoa *pode fazer*. Sem essa separação todo botão vira "cor da marca"
e a tela perde hierarquia.

**Por que `ib-success` não é o teal.** Se "deferido" fosse `#009687`, todo estado de
sucesso pareceria apenas "cor da Imigrar" e a informação sumiria. O verde é
deliberadamente distante da marca.

## Tipografia

| papel | fonte | por quê |
|---|---|---|
| títulos | **Archivo** (com eixo de largura) | grotesca de manchete: autoridade sem frieza |
| corpo e interface | **Public Sans** | tipografia de sistema de design de governo — o registro certo para quem passa o dia em documento, protocolo e prazo |
| dados | **IBM Plex Mono** | protocolo, data, código de idioma e a faixa MRZ; tudo que alinha em coluna |

Carregadas por `next/font/google` em `app/layout.tsx`, que baixa e serve local no
build — em produção não há requisição a servidor de fonte.

## O guilhoché

O padrão de linhas gravadas da impressão de segurança — a roseta que aparece no fundo
de passaporte, visto e cédula. Foi o primeiro recurso antifalsificação da história e
continua sendo o que faz um documento *parecer* um documento.

É **textura, não enfeite**: vem do mesmo mundo da faixa MRZ e reforça a mesma ideia,
em vez de competir com ela. Um passaporte tem os dois; o painel também.

A curva é um hipotrocoide, a mesma que um espirógrafo desenha, gerada em SVG por
`components/guilloche.tsx` — nenhuma imagem, nenhuma dependência:

```
x = (R−r)·cos t + d·cos((R−r)/r · t)
y = (R−r)·sin t − d·sin((R−r)/r · t)
```

Variar `d` em passos pequenos produz as linhas paralelas do entalhe; `dentes` muda a
contagem de pétalas.

**Sempre com véu.** No documento impresso a roseta é densa na margem e recua onde
entra o dado. Sem isso ela come o texto — foi exatamente o que aconteceu na primeira
tentativa: o rótulo e os campos do login ficaram ilegíveis por cima do padrão. A
receita é um gradiente da cor de fundo por cima da roseta e por baixo do conteúdo.

Opacidades que funcionaram: `/[0.16]` a `/[0.2]` sobre fundo escuro, `/[0.05]` como
marca d'água sobre fundo claro.

## A faixa MRZ

MRZ é a zona de leitura mecânica no rodapé de todo passaporte: caixa alta, largura
fixa, vazios preenchidos com `<`. É o artefato mais reconhecível do mundo de quem
atravessa fronteira — e é literalmente o que a pessoa do outro lado da conversa
carrega no bolso.

É o **elemento de assinatura** do painel, e é o único lugar onde gastamos ousadia.
Aparece em três lugares, sempre com o mesmo componente (`components/marca.tsx`):

- no rail, sob o logotipo, dizendo o que este console é;
- no login, ao pé do painel escuro, com a luz de leitura atravessando uma vez a cada ciclo;
- e é o formato previsto para número de protocolo nas listas.

`prefers-reduced-motion` desliga a leitura.

Cabe **25 caracteres** no rail (10px de corpo + 0,22em de entreletra em 208px úteis).
Acima disso a faixa corta no meio da palavra.

## O login não explica o sistema

Uma versão intermediária trazia, no painel escuro, um parágrafo sobre multi-idioma e
uma grade de campos (`Atendimento / Service`, `Idiomas / Languages`…) descrevendo o
produto. Ficou bonito e estava errado: **console interno não é lugar de explicar o
sistema para quem já trabalha nele.** Isso é página de venda.

O que ficou: a roseta gravada, o logotipo centrado e a faixa MRZ no pé. O lado do
formulário fica limpo — sem textura, sem marca no desktop (o painel escuro já a
carrega), só os campos. Uma marca por viewport.

Vale como regra para as próximas telas do painel.

## Arquivos de marca

`public/marca/` — vieram do Drive do cliente (`[116] Imigrar Brasil → [01] Logotipo`).
`simbolo*.png` é recorte do logotipo original (825×824 px, canto superior esquerdo),
não um redesenho.

Use o componente, não a `<img>`: `<Marca />`, `<Marca tom="escuro" />`, `<Simbolo />`.
Sobre fundo escuro entra a versão negativa da própria marca — nada de chip branco
atrás do logo.

**Cuidado com `simbolo-branco`:** a versão negativa não tem forma interna, então sobre
o azul ela lê como um bloco chapado. Em fundo escuro prefira o logotipo completo.

## O que ainda é da Shine Rio

A troca de identidade cobriu a interface. **Não cobriu `lib/agent/*`**, que é a lógica
de domínio da Shine Rio — precificação de limpeza, CCT, dimensionamento de posto — e
ainda cita "Shayene" e "Shine Rio" internamente. Renomear ali seria cosmético num
código que a Fase 4 substitui inteiro, e quebraria a suíte de 476 testes sem
benefício.

Do mesmo modo, **Propostas, Preços, Orçamento e Funcionários saíram do menu mas
continuam no disco**. São telas de precificação de limpeza sem equivalente em
imigração. Tirá-las da navegação é o primeiro passo; apagar as rotas é Fase 4.
