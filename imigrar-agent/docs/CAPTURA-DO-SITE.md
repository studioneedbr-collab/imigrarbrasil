# Captura de lead do site → CRM

Para o **Danilo** (site WordPress da Imigrar Brasil). Fica para depois — a rota já está no
ar, esperando ser chamada.

```
POST https://agente.imigrarbrasil.com.br/api/captura/site
Content-Type: application/json
X-Imigrar-Token: <segredo — combinar>
```

```json
{
  "nome": "Yolanda Pérez",
  "telefone": "+55 95 99123-4567",
  "email": "yolanda@exemplo.com",
  "mensagem": "sou venezuelana, moro em Boa Vista e recebi uma multa migratória",
  "origem": "formulario"
}
```

`nome` é obrigatório, mais **telefone ou e-mail** (um dos dois). `mensagem` e `origem` são
opcionais. Telefone em qualquer formato. Resposta: `{"ok":true,"lead_id":"…","novo":true}`.
Erros: `400` dados incompletos · `401` token errado · `503` segredo não configurado do
nosso lado.

## No WordPress

Qualquer plugin de formulário com **webhook** resolve — WPForms, Elementor Forms, Fluent
Forms, Contact Form 7 + CF7 Webhook. Aponte para a URL acima, método POST, corpo JSON,
com o header do token. O chat do site é o mesmo caminho, com `"origem": "chat"`.

Se o plugin não deixar mandar header, o token aceita ir na URL: `?token=<segredo>`.

**Chame pelo servidor (webhook do plugin), não por `fetch` no tema.** No navegador o token
fica à vista no código-fonte da página. Se não houver jeito, avise: precisamos liberar o
domínio no CORS e usar um token descartável.

## Anti-spam

Inclua no formulário um campo escondido chamado `website` — por CSS, **não**
`type="hidden"`, que os robôs pulam. Robô preenche; gente não. Vindo preenchido, a rota
responde `200` e descarta em silêncio.

## O que acontece do nosso lado

- O caso entra na etapa **Novo** do funil, na mesma fila de quem escreve no WhatsApp.
- O texto de `mensagem` passa pela triagem: nacionalidade, onde a pessoa está e sinal de
  prazo já chegam preenchidos na ficha.
- **O mesmo telefone é a mesma pessoa.** Quem preenche hoje e escreve no WhatsApp amanhã é
  um card só.
- **Ninguém recebe mensagem automática por isso.** Preencher formulário não é escrever
  para o nosso número, e o sistema não fala primeiro com quem nunca falou com ele — é
  assim que um WhatsApp é denunciado e derrubado. Quem decide chamar é uma pessoa.
