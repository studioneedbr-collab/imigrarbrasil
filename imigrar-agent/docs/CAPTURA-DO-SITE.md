# Captura de lead do site → CRM

Para quem tem acesso ao WordPress da Imigrar Brasil (`imigrarbrasil.com`, Hostinger).

## O que está acontecendo hoje

O formulário do site é do plugin **`ibexgo-leads`** (não é Elementor Forms, embora o
Elementor Pro esteja instalado). Ele pede **Nome** e **WhatsApp**, posta em
`/wp-json/ibexgo/v1/leads/submit`, guarda a linha na lista dele e então **redireciona a
pessoa para `wa.me/5511919854664`** com a mensagem pronta *"Olá, estive no site da Imigrar
Brasil. Gostaria de mais informações."*

Quem completa esse último passo já chega ao atendimento: a mensagem cai no webhook do
WhatsApp como qualquer outra. **Quem não completa, não chega.** E é gente que digitou nome
e telefone — decidiu ser procurada. Ela fica só na lista do plugin, dentro do WordPress,
que ninguém abre como fila.

É esse trecho — entre o "Enviar" e o WhatsApp — que a integração fecha.

**`5511919854664` é o número do agente** — confirmado. Então quem completa o passo do
WhatsApp cai no atendimento pelo caminho normal.

## Instalação (5 minutos)

**1.** `Plugins → Adicionar novo → Enviar plugin` → escolha **`imigrar-agent/wordpress/imigrar-crm.zip`** → Instalar → **Ativar**.

**2.** No menu lateral aparece **Imigrar CRM**. Cole ali o token — é o mesmo valor de
`SITE_CAPTURE_TOKEN` no Vercel — e marque o que deve subir:

- **Orçamentos** (e qualquer outro tipo de conteúdo com lead dentro);
- **Formulários do Elementor**, para o Contato do Fale Conosco.

**3.** Aperte **Testar conexão com o CRM**. Ele manda um registro de teste sem telefone —
exercita rede, token e rota inteira, e **não cria card nenhum**, porque o CRM descarta
registro sem telefone. Um botão de teste que deixa lixo é um botão que ninguém aperta.

**4.** Para os orçamentos que já existem, **Enviar todos agora**. Mesmo caminho, mesma
deduplicação: apertar duas vezes não duplica.

### Era mu-plugin, virou plugin normal

Mu-plugin (arquivo solto em `wp-content/mu-plugins/`) carrega sempre, não aparece na lista
para alguém desativar por engano e nenhuma atualização o apaga. Mas **não instala por ZIP**
— é FTP toda vez, inclusive para corrigir uma linha. Na prática, correção que exige FTP é
correção que não sobe, e um plugin que ninguém atualiza é pior do que um que alguém pode
desativar sem querer.

O risco que a troca traz — ser desativado e o lead parar de chegar em silêncio — é o que o
painel responde: ele mostra o estado de cada função e os últimos 50 envios.

### O token: painel ou wp-config

O caminho normal é o campo do painel. Quem preferir tirá-lo do banco pode definir no
`wp-config.php`, e a constante **vence**:

```php
define('IMIGRAR_CAPTURE_TOKEN', 'o-mesmo-valor-do-vercel');
```

Nos dois casos o segredo é legível por quem administra o site; a diferença real é que o do
banco aparece num dump e o da constante não.

> O campo do painel **nunca devolve o segredo para a tela**, e por isso deixá-lo em branco
> significa "não mexer", não "apagar" — senão salvar qualquer outro ajuste derrubaria a
> integração em silêncio.

### Regerar o ZIP

Depois de mexer em `wordpress/imigrar-crm/`, rode `wordpress/build.sh`. Ele refaz o
`imigrar-crm.zip` com a pasta interna certa (`imigrar-crm/`), que é o que faz o WordPress
reconhecer um reenvio como atualização em vez de instalar um segundo plugin ao lado.

## O painel do plugin

O menu **Imigrar CRM** abre com quatro cartões de estado — token, formulários, tipos de
conteúdo e medição — porque a pergunta que traz alguém ali quase sempre é "está
funcionando?", e ela tem que ser respondida sem rolar a página.

Abaixo, a tabela **o que este plugin faz**: cada função com ligada/desligada, o que ela
pega e qual é a identidade do caso (telefone, ou tipo + ID do post).

E **os últimos 50 envios**, com data, origem, desfecho e motivo. O `error_log` continua
sendo escrito, mas em hospedagem compartilhada quase ninguém alcança aquele arquivo — e
erro que só existe em log inalcançável é erro que ninguém vê. É nessa lista que "o lead de
ontem chegou?" se responde.

## A medição (Studio Need)

O plugin instala o `sn-track.js` antes do `</body>`. Ele conta pageview, clique
e envio de formulário sozinho — mas **neste site, sem ajuda, ele mediria quase nada do que
interessa**. Rodei o tracker real contra o HTML real das páginas, com e sem a marcação:

| | sem marcação | com marcação |
|---|---|---|
| clique no WhatsApp | *nada* | `whatsapp` |
| envio do formulário do topo | *sem rótulo* | `atendimento-online` |
| envio do Fale Conosco | `Contato` | `fale-conosco` |

Por quê:

- **Não existe um único link `wa.me` no site.** O ícone de WhatsApp é um `<a>` que abre um
  popup do Elementor. O tracker reconhece a intenção pelo `href` (`wa.me`, `tel:`,
  `mailto:`) e, na falta dela, só mede o que parece botão — a regra procura
  `btn|button|cta|acao|action` na classe, e `elementor-icon` não tem nenhuma. O clique
  mais importante do site ficaria fora da conta, e o relatório diria "zero WhatsApp"
  parecendo um dado em vez de um furo.
- **O formulário do ibexgo não tem `name` nem `id`.** O rótulo sai de `data-sn-track`,
  depois `name`, depois `id`; sem os três, o envio chega sem rótulo nenhum.
- **O popup não está no HTML da página** — o Elementor o carrega depois, por AJAX. Por
  isso a marcação é feita na hora do clique, e não na carga da página.

**Quem trabalha no site não é medido.** Usuário logado que pode editar posts fica de fora,
senão as visitas do escritório viram a maior parte do número num site de pouco movimento.
Para conferir a instalação, **use uma janela anônima**.

A chave `snk_…` fica no próprio arquivo: ela é pública por natureza, vai no código-fonte de
toda página. Não confunda com o `IMIGRAR_CAPTURE_TOKEN`, que é segredo e mora no
`wp-config.php`. Para trocar a chave sem editar o plugin, defina `IMIGRAR_SN_KEY`.

> ⚠️ **O tracker manda os campos do formulário para o servidor do Studio Need**, além do
> que o site já faz. Quem preenche o Fale Conosco manda nome, telefone, e-mail e mensagem
> para lá também. É o comportamento documentado do próprio `sn-track.js`, e é uma decisão
> que o cliente precisa saber que foi tomada — ainda mais num site com banner de
> consentimento (CookieYes) instalado, que o tracker **não** consulta antes de medir.

> O lead do formulário do topo passa a existir em **três lugares**: a lista do plugin
> `ibexgo` no WordPress, o CRM e o Studio Need. Nenhum deles é duplicata dentro do CRM —
> mas vale saber, para ninguém se assustar ao comparar contagens.

## O que o WordPress manda

O plugin cuida disso sozinho. Fica registrado para quando alguém precisar mexer:

```
POST https://agente.imigrarbrasil.com.br/api/captura/site
Content-Type: application/json
X-Imigrar-Token: <o segredo>
```

```json
{
  "nome": "Yolanda Pérez",
  "telefone": "+55 95 99123-4567",
  "pagina": "https://imigrarbrasil.com/nossos-servicos",
  "ref": "parceiro-boa-vista",
  "idioma": "es",
  "origem": "formulário do site"
}
```

`nome` é obrigatório, mais **telefone ou e-mail** (um dos dois). O resto é opcional.
Telefone em qualquer formato. Resposta: `{"ok":true,"lead_id":"…","novo":true}`.
Erros: `400` dados incompletos · `401` token errado · `503` segredo não configurado do
nosso lado.

**`idioma`** vem do cookie `googtrans` do GTranslate. O site está com
`url_structure: "none"` — a tradução acontece no navegador e a URL nunca muda, então esse
cookie é o único rastro que chega ao servidor. O GTranslate oferece alemão e italiano, que
o atendimento não cobre; quem filtra é o CRM, não o WordPress — a lista de idiomas fica
num lugar só.

## Os registros do WordPress no CRM, na hora

O site guarda leads em tipos de conteúdo próprios — **Orçamentos** (`orcamento`) e o que
criarem depois — que só existem dentro do wp-admin. **Nenhum aparece na REST pública**
(conferi: `wp/v2/orcamento` responde 404 e todas as rotas de lead do `ibexgo` respondem
401). Está certo assim, e é por isso que não há como buscá-los de fora. Então o sentido se
inverte: **o WordPress empurra**.

Em **menu **Imigrar CRM****, marque os tipos que devem subir. A partir daí,
cada registro vai para o CRM **no momento em que é salvo**. Não há exportação, nem
planilha, nem passo manual.

**O plugin não escolhe nada.** Ele manda o dicionário cru — todos os campos do registro,
com os nomes que o ACF usa no site. Quem interpreta é o CRM, com as mesmas regras da
importação de planilha. Um campo novo criado no ACF passa a ser entendido **sem tocar no
plugin**, e não existem duas listas de campos em dois servidores para divergir em silêncio.

**Salvar de novo atualiza, não duplica.** O CRM identifica o registro pelo par
(`wordpress:orcamento`, ID do post). Editar o mesmo orçamento dez vezes dá um card só — e
continua sendo o mesmo caso mesmo que o telefone mude lá, porque o id não muda.

**O que já existe:** o gancho só alcança o que for salvo daqui para a frente. Para os
orçamentos que já estão no site, use **Enviar todos agora** na mesma tela. Passa pelo mesmo
caminho e pela mesma deduplicação — apertar duas vezes não duplica nada.

### O que o CRM faz com o que chega

- Caso novo entra na etapa **Novo**, marcado como vindo do site.
- **Atualizar preenche buraco, não reescreve.** O que uma pessoa escreveu na ficha vale
  mais do que um campo do site: nome corrigido, resumo escrito e telefone ajustado ficam
  como estão.
- **A etapa nunca é movida por quem chega de fora.** Editar o registro no WordPress não
  puxa de volta para "Novo" um caso que o time já avançou.
- Registro **sem telefone** (um rascunho vazio, por exemplo) é ignorado com `200` e uma
  explicação no log — não é erro, e responder erro encheria o log do site de falhas a cada
  salvamento até ninguém mais lê-lo.
- O mesmo telefone continua sendo a mesma pessoa: orçamento no site e conversa no WhatsApp
  viram **um card só**.

### Os formulários do Elementor

O `/fale-conosco/` tem **dois** formulários: o do `ibexgo` (nome e WhatsApp) e um do
Elementor chamado **Contato**, com nome, telefone, e-mail e **mensagem**.

O do Elementor não passa por nenhum dos outros ganchos — ele envia por `admin-ajax` e não
cria post. Ligue em **menu **Imigrar CRM****, na seção *Formulários do
Elementor*. Nasce desligado: mandar lead para a fila é ato deliberado.

Vale a pena porque é o **único formulário do site com campo de mensagem**. O texto passa
pela triagem, e a ficha chega com nacionalidade, prazo e onde a pessoa está já preenchidos
— em vez de a Ana ter que perguntar tudo.

**Ele vai sem id, de propósito.** Um envio de formulário não é um registro que alguém edita
depois; é um acontecimento. Inventar um id (um hash, um carimbo de tempo) seria pior do que
não ter: um id que muda a cada envio faria a mesma pessoa preenchendo duas vezes virar dois
casos. Sem id, a identidade é o telefone — a mesma chave do WhatsApp.

Formulário **sem telefone** (uma newsletter, por exemplo) é descartado sem virar caso, então
ligar isto não enche a fila de inscrição de e-mail.

### Se algo não chegar

O motivo está no `error_log` do WordPress, com o prefixo `[imigrar-captura]`: token
ausente, CRM fora do ar ou registro recusado, com o código HTTP.

A mesma tela tem um **Baixar CSV** no rodapé. Não é necessário para a integração — serve
para olhar os campos de um tipo antes de ligá-lo, ou para mandar a alguém conferir.

## Anti-spam

O formulário atual não tem armadilha. Se um dia entrar spam, inclua um campo escondido
chamado `website` — escondido **por CSS**, não `type="hidden"`, que os robôs pulam. Robô
preenche; gente não. Vindo preenchido, a rota responde `200` e descarta em silêncio.

## O que acontece do nosso lado

- O caso entra na etapa **Novo** do funil, na mesma fila de quem escreve no WhatsApp.
- **A Ana não pergunta o nome de novo.** O lead já chega com o nome digitado no
  formulário, e a abertura pula direto para o assunto.
- **O mesmo telefone é a mesma pessoa.** Quem preenche o formulário e escreve no WhatsApp
  em seguida é **um card só**, com a ficha inteira — não dois com metade da história em
  cada. Reimportar ou reenviar não duplica.
- **Ninguém recebe mensagem automática por isso.** Preencher formulário não é escrever
  para o nosso número, e o sistema não fala primeiro com quem nunca falou com ele — é
  assim que um WhatsApp é denunciado e derrubado. Quem decide chamar é uma pessoa.
- Quem já era caso do WhatsApp e preenche o formulário depois **não volta para "Novo"**, e
  continua tendo chegado pelo WhatsApp.
