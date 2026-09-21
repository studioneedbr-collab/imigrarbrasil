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

> ⚠️ **Confirmar antes:** `5511919854664` é o número que a Ana atende? Se for o número de
> teste do Matheus, todo lead do site está sendo mandado para um WhatsApp que ninguém
> responde, e isso é mais urgente do que esta integração.

## Instalação (10 minutos)

**1. O segredo.** No `wp-config.php`, antes da linha `/* That's all, stop editing! */`:

```php
define('IMIGRAR_CAPTURE_TOKEN', 'o-mesmo-valor-de-SITE_CAPTURE_TOKEN-no-vercel');
```

O token **não** fica no arquivo do plugin — assim ele pode ser lido, copiado e versionado
sem carregar segredo junto.

**2. O arquivo.** Copie `wordpress/imigrar-captura.php` (deste repositório) para
`wp-content/mu-plugins/imigrar-captura.php`. Crie a pasta `mu-plugins` se não existir.

Em `mu-plugins/` ele é carregado sempre: não aparece na lista de plugins para alguém
desativar por engano, não some ao trocar de tema e não é apagado por atualização.

> ⚠️ **Um erro de sintaxe em `mu-plugins/` derruba o site inteiro**, porque o arquivo é
> carregado em toda página. Suba o arquivo como está, sem editar. Se precisar mudar algo,
> confira a sintaxe antes.

**3. Conferir.** Preencha o formulário do site com um nome de teste e **feche a aba na
hora do redirecionamento** (é o caso que a integração existe para pegar). O caso deve
aparecer na coluna **Novo** do CRM em segundos, já com o nome.

Não apareceu? O motivo está no `error_log` do WordPress, com o prefixo
`[imigrar-captura]` — token errado, rota fora do ar ou campo do formulário renomeado.

## O que o WordPress manda

O `mu-plugin` cuida disso sozinho. Fica registrado para quando alguém precisar mexer:

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
