# Conferência das CCTs 2026 — motor de preço herdado

> **Este documento descreve a maquinaria comercial que veio da base que originou este
> código.** Ela NÃO faz mais parte do agente: a Ana não cota, não precifica e não fala de
> valor. O que está aqui serve às telas de Preços e Orçamento do painel, e o código mora
> em `lib/comercial/`.

**Origem:** `SHAIENE-CTTs-2026.zip`, enviado pelo Pedro Provadelli em 13/08/2026.
**Onde os dados vivem:** `lib/comercial/cct.ts`. Cada valor tem a cláusula de origem no campo `fonte`.

O pedido do cliente da base original, em 13/08/2026, foi que a IA inserisse os dados da CCT numa planilha modelo e
chegasse ao preço a partir dela. É o que está feito: o motor reproduz a aba SERVENTE da
*Planilha de Composição de Custos 2026* da empresa de origem (layout da IN 05/2017), alimentado pela
convenção da praça, e cada cotação gera a planilha preenchida em `.xlsx`, com a cláusula
ao lado de cada célula.

As cinco células listadas pelo cliente estão implementadas: **adicional noturno**,
**insalubridade**, **periculosidade**, **intrajornada** e **liderança**.

---

## Regra de liberação

Uma praça só cota quando alguém confere. No código isso é o campo `cadastrada` de cada
praça em `lib/comercial/cct.ts`.

| | |
|---|---|
| `cadastrada: true` | O motor cota sozinho. |
| `cadastrada: false` | Sai "sob consulta": ela nomeia a praça, explica que o piso é da convenção local e passa para um consultor. |

Hoje **só o Rio está liberado**. As outras oito têm os dados lidos da convenção, mas
travados — é o que evita repetir 10/08/2026, quando um piso de portaria inventado
(R$ 1.998,00) chegou a um cliente. O piso real do Rio é R$ 2.051,95.

**Para liberar uma praça:** confira as pendências da seção dela, corrija o que estiver
errado em `lib/comercial/cct.ts`, esvazie a lista `pendencias` e vire `cadastrada` para `true`.

---

## ✅ Rio de Janeiro — liberado

**CCT SIEMACO-RJ x SEAC-RJ 2026/2027** · registro MTE RJ000911/2026 · vigência 01/03/2026 a 28/02/2027

A convenção confirmou os três números que a planilha 2026 já usava: piso R$ 1.851,90
(cláusula 3ª), auxílio-alimentação R$ 27,00/dia (cláusula 21ª) e Benefício Social Familiar
R$ 22,70 (cláusula 27ª). O ASG continua fechando exatamente em **R$ 4.873,52**.

### O que mudou na prática

| Função | Antes | Agora | Fonte |
|---|---|---|---|
| Porteiro | sob consulta | **R$ 2.051,95** | Cláusula 3ª — "PORTEIRO/VIGIA TERCEIRIZADO/ZELADOR" |
| Zelador | sob consulta | **R$ 2.051,95** | mesma linha da cláusula 3ª |
| Recepcionista | sob consulta | **R$ 1.966,52** | Cláusula 3ª |
| Jardineiro | sob consulta | **R$ 3.035,56** | Cláusula 3ª |
| Operador de Piscina | sob consulta | **R$ 1.851,90** | Cláusula 7ª, parágrafo único (enquadramento) |

A cláusula 7ª resolve quem não está na tabela: função técnica ou de liderança pega o piso
do encarregado (R$ 2.312,75); as demais, o piso de servente (R$ 1.851,90). Com isso **o
catálogo inteiro passou a ter piso no Rio**. Quando o piso vem daí, a planilha avisa na
seção OBSERVAÇÕES — não é um piso nominal.

### Adicionais implementados

| Adicional | Regra | Cláusula |
|---|---|---|
| Noturno | 20% sobre o salário base, 22h–5h, com hora reduzida de 52min30s | 17ª |
| Insalubridade | 20% grau médio · 40% grau máximo, **sobre o piso de servente** | 18ª |
| Periculosidade | 30% sobre o salário base. Não acumula com insalubridade | 19ª (e 18ª §7º) |
| Intrajornada | 30 min indenizados com acréscimo de 50%, por dia trabalhado | 40ª §4º |
| Liderança | 15% até 15 pessoas · 25% de 16 a 30 · 30% de 31 a 60 · 40% acima de 61 | 14ª e 13ª |

Nenhum é automático: o operador do painel informa o local, o horário e o tamanho da equipe, e o motor passa
o que o cliente disse. Se o cliente não souber, ela cota sem o adicional e **diz isso** ao
apresentar o valor.

### Duas mudanças de método que valem conferência

1. **Dias trabalhados por escala.** Vale-transporte e refeição são "por dia efetivamente
   trabalhado" na convenção. O motor agora usa 22 dias no 5x2, 26 no 6x1 e **15,21 no
   12x36**. Antes usava 22 para tudo, o que punha sete dias de vale a mais num posto de
   portaria. O porteiro 12x36 fica em R$ 5.015,04 (VT R$ 28,98 + refeição R$ 369,60).
2. **Base dos encargos.** O Módulo 2.2 (35,3%) incide sobre a remuneração já acrescida do
   13º e das férias, como na planilha (R$ 2.230,24 × 35,3% = R$ 787,27), não sobre o
   salário seco. Antes o motor usava um percentual calibrado equivalente; o resultado do
   ASG é o mesmo, mas agora a conta bate linha a linha com a planilha modelo.

---

## 🔒 São Paulo — travado

**SEAC-SP x SIEMACO-SP**, tabela vigente a partir de 01/01/2026.

Pisos: mínimo R$ 1.837,40 · demais funções R$ 1.890,24 · copeira R$ 1.850,07 · limpador de
vidro R$ 2.014,10 · recepcionista R$ 1.995,25 · porteiro/controlador R$ 2.162,60 ·
zeladoria R$ 2.351,12 · líder (até 10) R$ 2.003,90 · encarregado (11+) R$ 2.404,68.
Benefícios: VR R$ 21,80/dia (desconto R$ 1,46) · cesta básica I R$ 151,91 · BSS R$ 16,75.

**Pendências**
- O corpo da CCT não veio no zip, só o comunicado conjunto e a tabela de salários. Faltam as cláusulas de noturno, insalubridade, periculosidade e intrajornada.
- A tabela não nomeia "servente"/"ASG" — foram encaixados no PISO SALARIAL MÍNIMO. **Confirmar.**
- Desconto do VR é R$ 1,46 por dia, não percentual. Confirmar se é por dia trabalhado.
- Tarifa de vale-transporte de São Paulo não consta.
- PPR de R$ 356,39/ano não foi lançado — decidir se entra no custo do posto.

## 🔒 Minas Gerais — travado

**SINDEAC x SEAC-MG** (a mesma tabela de pisos vale para SINDI-ASSEIO RMBH e Uberlândia).

Pisos: servente/ASG R$ 1.772,80 · limpador de vidro R$ 1.941,39 · porteiro R$ 2.294,91 ·
recepcionista R$ 3.043,29 · jardineiro R$ 2.468,38 · zelador e encarregado R$ 2.648,04.
Noturno 39% · intrajornada 50% · ticket R$ 31,34/dia · cesta básica R$ 200,00/mês.

**Pendências**
- Três convenções no zip com a mesma tabela de pisos mas alimentação diferente (SINDEAC R$ 31,34/dia; Uberlândia R$ 416,87/mês). **Definir qual vale por cidade.**
- Noturno de 39% é atípico — a CCT diz que já compensa a hora reduzida. Confirmar com o DP.
- Insalubridade: a convenção só trata do caso de banheiros públicos. Percentual e base a extrair.
- Periculosidade e gratificação de liderança não foram localizadas.
- Tarifa de vale-transporte não consta.

## 🔒 Brasília / Distrito Federal — travado

**SINDISERVIÇOS-DF x SEAC-DF**, vigência 2025/2026.

Pisos: servente/ASG R$ 1.743,69 · zelador R$ 1.900,20 · jardineiro e recepcionista
R$ 2.574,37 · líder de equipe R$ 2.600,00 · encarregado R$ 3.383,50 · supervisor
R$ 4.220,33. Noturno 22,5% (hora de 60 min) · periculosidade 30% (jauzeiro em balancim).

**Pendências**
- **Vigência 2025/2026 — é a convenção mais antiga do lote. Confirmar se já saiu a de 2026/2027.**
- Valor do auxílio-alimentação não foi localizado (cláusula 17ª).
- Insalubridade incide sobre o salário mínimo nacional, que não está cadastrado (ver `SALARIO_MINIMO_NACIONAL`).
- Insalubridade de 10% para cozinheiras (cláusula 14ª) não foi lançada.
- Tarifa de vale-transporte não consta.

## 🔒 Espírito Santo — travado

Piso único de **R$ 2.526,00** para quem exerce função profissional (cláusula 3ª, alínea a).
Noturno 20% · alimentação R$ 26,00/dia · desconto de VT até 6%.

**Pendências**
- A CCT não traz tabela por função. **Confirmar se porteiro, recepcionista e jardineiro entram todos nesse mesmo valor.**
- A alínea "b" da cláusula 3ª (outro grupo de trabalhadores) não foi lida — pode haver piso menor.
- Há piso diferenciado para os "Grandes Complexos da Região Sul" (Selita, Porto Alegre, Nassau, Usina Paineiras, Suzano) que não foi lançado.
- Tarifa de vale-transporte não consta.

## 🔒 Mato Grosso do Sul — travado

Piso único de **R$ 1.651,00** mais gratificação por função. Noturno 25% (hora de 60 min) ·
periculosidade 30% · alimentação R$ 400,00/mês · intrajornada 60 min a 50%.

**Pendências**
- **A tabela de gratificações por função tem ~37 linhas e só parte foi lançada — faltam porteiro, jardineiro e zelador.**
- Insalubridade não foi localizada no texto.
- A gratificação de encarregado é proporcional ao número de empregados, mas as faixas não foram lidas.
- Tarifa de vale-transporte não consta.

## 🔒 Paraná — travado

Convenção 2026/2028. Pisos: servente/ASG R$ 1.900,00 · copeira R$ 1.961,00 · jardineiro
R$ 2.029,00 · porteiro R$ 2.415,00 · zelador/almoxarife/supervisor R$ 3.023,00 ·
encarregado por faixa (R$ 2.191,00 / R$ 2.279,00 / R$ 2.404,00). Alimentação R$ 494,00/mês
com desconto de 20%.

**Pendências**
- Recepcionista tem gratificação contratual de R$ 43,00/mês somada ao piso — o piso-base dela não foi localizado.
- Porteiro em regime SDF (sábado, domingo e feriado, 12h) tem composição própria de R$ 1.869,00 com rubricas separadas — não foi modelado.
- Noturno e periculosidade não foram localizados.
- Intrajornada aparece como rubrica no porteiro SDF, mas a regra geral não foi lida.
- Tarifa de vale-transporte não consta.

## 🔒 Rio Grande do Sul — travado

Salário normativo geral **R$ 1.765,86** (cláusula 4ª), com tabela por função na cláusula 3ª:
porteiro/vigia R$ 2.126,25 · recepcionista R$ 1.996,44 · zelador R$ 2.151,89 · almoxarife
R$ 2.120,93 · cozinheiro R$ 1.854,05. Alimentação R$ 27,15/dia com desconto de até 19%.

**Pendências**
- Noturno, insalubridade, periculosidade e intrajornada não foram localizados.
- O Benefício Social Familiar é citado, mas o valor do custeio não foi lido.
- Auxílio lanche (cláusula 21ª) para jornada de até 6h não foi lançado.
- Gratificação de liderança não foi localizada.
- Tarifa de vale-transporte não consta.

## 🔒 Santa Catarina — travado

**SEAC-SC**, a partir de 01/01/2026. **Atenção:** os pisos publicados já embutem
insalubridade ou periculosidade. Ex.: servente é anunciado como R$ 2.103,42, que é
R$ 1.752,85 de piso + R$ 350,57 de insalubridade grau médio. No sistema foi lançada só a
parcela salarial.

Pisos (parcela pura): servente/ASG R$ 1.752,85 · recepcionista R$ 1.857,54 · jardineiro
R$ 2.097,50 · zelador R$ 1.977,73 · porteiro R$ 2.496,27 · encarregado nível 1 R$ 2.397,34.

**Pendências**
- **Conferir se o DP calcula encargos sobre a parcela salarial pura ou sobre o total já com o adicional.** É a maior dúvida do lote.
- Valor do vale-alimentação não foi localizado.
- Insalubridade grau máximo é sobre o salário mínimo nacional — precisa do valor de 2026.
- Os pisos correspondem a 220h/mês; telefonista, digitador e ascensorista são 180h. O motor ainda não trata jornada reduzida.
- Tarifa de vale-transporte não consta.

---

## Fora do lote

Nordeste e Norte e Centro-Oeste estão cadastrados só como nome, sem piso. Servem para a
o painel nomear a praça sem cair no preço do Rio. **Nenhuma convenção
dessas regiões veio no lote** — pedir ao Pedro antes de cotar.

---

## Pendência que atravessa três praças

`SALARIO_MINIMO_NACIONAL` está zerado em `lib/comercial/cct.ts`. DF, Paraná e Santa Catarina
calculam insalubridade sobre o salário mínimo nacional, e nenhum documento do lote traz o
valor de 2026. Enquanto estiver zerado, posto insalubre nessas praças sai sob consulta —
que é o desfecho seguro, mas é uma trava a menos para liberar.

---

## Antes de subir para produção

**Rode a migration `015_cct_rj_2026_catalogo.sql`.** Ela copia os pisos do Rio para a
tabela `function_pricing`, que é o que a tela Comercial → Preços por função mostra.

Ela é de **sincronia, não de comportamento**: o motor lê o piso de `lib/comercial/cct.ts` e
acerta o preço mesmo sem a migration. Sem ela, o preço sai certo mas a tela do admin
continua mostrando os R$ 0,00 antigos — e é esse tipo de desencontro entre tela e motor
que produziu o preço inventado de 10/08/2026.

**Não rode a `013`.** Ela ficou obsoleta: os cinco valores dela eram placeholders, e ela
escreve numa coluna (`beneficios`) que não existe no schema — falharia inteira.

## Onde ver a planilha preenchida

`GET /api/proposal/{id}/planilha` devolve o `.xlsx` da proposta, **um posto por aba**, com
os seis módulos e a cláusula de origem ao lado de cada célula que veio da convenção. Só
admin: a planilha mostra custo, margem e BDI, que não vão para o cliente.
