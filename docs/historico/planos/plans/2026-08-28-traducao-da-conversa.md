# Tradução da conversa — plano de implementação

> **Para quem executa:** use a skill `superpowers:subagent-driven-development` (recomendada)
> ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** mostrar, embaixo de cada mensagem de uma conversa que não é em português, a
tradução dela em português — traduzida na primeira abertura, guardada no banco, nunca no
lugar do original.

**Arquitetura:** um módulo novo (`lib/agent/traducao.ts`) traduz uma conversa inteira em
**uma** chamada ao DeepSeek e registra o custo em `chamadas_llm`. Uma rota
(`POST /api/conversations/[id]/traducao`) traduz só o que ainda não tem tradução e grava em
`messages.traducao_pt`. A tela dispara essa rota em segundo plano ao abrir; as traduções
chegam pelo polling de 3s que a página já faz, sem nenhum caminho de dados novo.

**Stack:** Next.js 14 (App Router), TypeScript, Supabase (PostgREST + SQL migrations),
Vitest. Todos os comandos rodam de `imigrar-agent/`.

**Spec:** [`docs/superpowers/specs/2026-08-28-traducao-da-conversa-design.md`](../specs/2026-08-28-traducao-da-conversa-design.md)

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/027_traducao_da_conversa.sql` | **criar** — coluna `messages.traducao_pt` e `'traducao'` na constraint de `chamadas_llm.tipo` |
| `lib/domain/types.ts` | **modificar** — `'traducao'` em `TipoChamadaLlm`/`TIPOS_DE_CHAMADA`; `traducaoPt` em `Message` |
| `lib/integracoes/provedores.ts` | **modificar** — rótulo do tipo novo |
| `lib/data/repository.ts` | **modificar** — assinatura `setMessageTraducao` |
| `lib/data/supabase-repository.ts` | **modificar** — `mapMessage` lê `traducao_pt`; implementação do setter |
| `lib/data/memory-repository.ts` | **modificar** — implementação do setter |
| `lib/agent/traducao.ts` | **criar** — a chamada ao modelo, o contrato da resposta e o registro do custo |
| `app/api/conversations/[id]/traducao/route.ts` | **criar** — traduz o que falta, grava, devolve |
| `app/dashboard/conversations/[id]/page.tsx` | **modificar** — dispara a tradução ao abrir e mostra o bloco embaixo do balão |
| `tests/traducao.test.ts` | **criar** — o módulo e o vocabulário de custo |
| `tests/repository.memory.test.ts` | **modificar** — o setter novo |

---

## Task 1: A migration

**Files:**
- Create: `supabase/migrations/027_traducao_da_conversa.sql`

Não há teste: é DDL. O que a substitui é a Task 2, que só passa se o tipo novo existir no
código, e a conferência manual do fim desta tarefa.

- [ ] **Passo 1: Escrever a migration**

```sql
-- 027 — A TRADUÇÃO DA CONVERSA, E O CUSTO DELA COM NOME PRÓPRIO.
--
-- A Ana responde na língua de quem escreveu. Isso é certo para o cliente e deixa o time
-- de fora: quem abre uma conversa em espanhol precisa ler o caso — o que o cliente disse
-- E o que a Ana respondeu — numa língua que não é a dele.
--
-- A tradução é GUARDADA na mensagem, e não recalculada a cada abertura, por dois motivos:
-- o texto de uma mensagem nunca muda depois de gravado, e a segunda abertura da mesma
-- conversa não tem por que custar de novo.
--
-- `traducao_pt` é nulo em três casos que não são erro: mensagem em português, mensagem
-- que ninguém abriu ainda, e mensagem sem texto (só anexo).

alter table messages add column if not exists traducao_pt text;

-- O TIPO DE CHAMADA PRECISA DE NOME PRÓPRIO.
--
-- A constraint nasceu na 024 com cinco tipos. Sem 'traducao' aqui, o insert do custo
-- falharia — e como `registrarChamada` engole exceção de propósito (um custo perdido é um
-- número, uma conversa perdida é uma pessoa), a falha seria SILENCIOSA: a tradução
-- funcionaria, e o custo dela simplesmente não existiria em Métricas.
alter table chamadas_llm drop constraint if exists chamadas_llm_tipo_check;
alter table chamadas_llm add constraint chamadas_llm_tipo_check
  check (tipo in ('redacao', 'extracao', 'classificacao', 'transcricao', 'embedding', 'traducao'));
```

- [ ] **Passo 2: Aplicar no banco**

Rodar: `npm run migrar`
Esperado: a saída lista `027_traducao_da_conversa.sql` como aplicada, e nenhuma outra.

- [ ] **Passo 3: Conferir que a coluna existe**

Rodar:

```bash
npm run migrar
```

Esperado: `nada a aplicar` (ou equivalente) — a segunda execução não repete a 027.

- [ ] **Passo 4: Commit**

```bash
git add supabase/migrations/027_traducao_da_conversa.sql
git commit -m "A mensagem ganha onde guardar a tradução, e o custo dela ganha nome"
```

---

## Task 2: O tipo `traducao` no vocabulário de custo

**Files:**
- Modify: `lib/domain/types.ts:501-514`
- Modify: `lib/integracoes/provedores.ts:49-56`
- Test: `tests/traducao.test.ts`

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/traducao.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TIPOS_DE_CHAMADA } from "@/lib/domain/types";
import { rotuloDoUso } from "@/lib/integracoes/provedores";

// O CUSTO DA TRADUÇÃO PRECISA APARECER SEPARADO.
//
// `registrarChamada` engole exceção de propósito. Se 'traducao' não for um tipo válido, a
// tradução funciona e o custo dela some sem erro nenhum — que é o pior jeito de um número
// ficar errado: ninguém descobre.
describe("tradução no vocabulário de custo", () => {
  it("é um tipo de chamada como os outros", () => {
    expect(TIPOS_DE_CHAMADA).toContain("traducao");
  });

  it("tem rótulo legível na tela de provedores", () => {
    expect(rotuloDoUso("traducao")).toBe("tradução");
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run tests/traducao.test.ts`
Esperado: FALHA — erro de tipo em `rotuloDoUso("traducao")` e `TIPOS_DE_CHAMADA` sem o item.

- [ ] **Passo 3: Adicionar o tipo**

Em `lib/domain/types.ts`, trocar o bloco `TipoChamadaLlm` / `TIPOS_DE_CHAMADA` por:

```ts
export type TipoChamadaLlm =
  | "redacao"
  | "extracao"
  | "classificacao"
  | "transcricao"
  | "embedding"
  | "traducao";

export const TIPOS_DE_CHAMADA: TipoChamadaLlm[] = [
  "redacao",
  "extracao",
  "classificacao",
  "transcricao",
  "embedding",
  "traducao",
];
```

Em `lib/integracoes/provedores.ts`, acrescentar a linha ao mapa `ROTULOS` (que é
`Record<TipoChamadaLlm, string>` e por isso deixa de compilar sem ela):

```ts
const ROTULOS: Record<TipoChamadaLlm, string> = {
  redacao: "redação",
  extracao: "extração",
  classificacao: "classificação",
  transcricao: "transcrição",
  embedding: "embedding",
  traducao: "tradução",
};
```

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `npx vitest run tests/traducao.test.ts`
Esperado: PASSA — 2 testes.

- [ ] **Passo 5: Commit**

```bash
git add lib/domain/types.ts lib/integracoes/provedores.ts tests/traducao.test.ts
git commit -m "A tradução entra na contabilidade com nome próprio"
```

---

## Task 3: A tradução guardada na mensagem

**Files:**
- Modify: `lib/domain/types.ts:77-88`
- Modify: `lib/data/repository.ts:51`
- Modify: `lib/data/supabase-repository.ts:67-74` e `:270-272`
- Modify: `lib/data/memory-repository.ts:160-165`
- Test: `tests/repository.memory.test.ts`

- [ ] **Passo 1: Escrever o teste que falha**

Acrescentar ao final do `describe("MemoryRepository", ...)` em
`tests/repository.memory.test.ts`:

```ts
  it("guarda a tradução na mensagem, sem tocar no original", async () => {
    const conv = await repo.getOrCreateConversation("sim:trad");
    const m = await repo.addMessage(conv.id, "user", "necesito ayuda con mis documentos");
    expect(m.traducaoPt ?? null).toBeNull();

    await repo.setMessageTraducao(m.id, "preciso de ajuda com meus documentos");

    const [gravada] = await repo.listMessages(conv.id);
    expect(gravada.traducaoPt).toBe("preciso de ajuda com meus documentos");
    // O ORIGINAL É A FONTE. É um caso de imigração: alguém vai precisar conferir a
    // palavra exata que a pessoa escreveu.
    expect(gravada.content).toBe("necesito ayuda con mis documentos");
  });
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run tests/repository.memory.test.ts`
Esperado: FALHA — `repo.setMessageTraducao is not a function`.

- [ ] **Passo 3: Implementar**

Em `lib/domain/types.ts`, na interface `Message`, acrescentar o campo depois de
`mediaText`:

```ts
export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  whatsappMessageId?: string | null;
  createdAt: string;
  mediaUrl?: string | null;
  mediaType?: MediaKind | null;
  mediaName?: string | null;
  mediaText?: string | null;
  /**
   * A tradução em português desta mensagem, quando a conversa não é em português.
   * Nulo é o normal: mensagem em português, conversa que ninguém abriu ainda, ou
   * mensagem sem texto. Nunca substitui `content` — anda ao lado dele.
   */
  traducaoPt?: string | null;
}
```

Em `lib/data/repository.ts`, na interface `Repository`, logo abaixo de
`setMessageMediaText`:

```ts
  setMessageTraducao(messageId: string, texto: string): Promise<void>;
```

Em `lib/data/supabase-repository.ts`, no `mapMessage`, acrescentar a última linha:

```ts
const mapMessage = (r: DbMessage): Message => ({
  id: r.id, conversationId: r.conversation_id, role: r.role as Message["role"],
  content: r.content, whatsappMessageId: r.whatsapp_message_id, createdAt: r.created_at,
  mediaUrl: (r as unknown as Record<string, any>).media_url ?? null,
  mediaType: ((r as unknown as Record<string, any>).media_type as MediaKind) ?? null,
  mediaName: (r as unknown as Record<string, any>).media_name ?? null,
  mediaText: (r as unknown as Record<string, any>).media_text ?? null,
  traducaoPt: (r as unknown as Record<string, any>).traducao_pt ?? null,
});
```

e, logo abaixo de `setMessageMediaText`:

```ts
  async setMessageTraducao(messageId: string, texto: string) {
    await this.db.from("messages").update({ traducao_pt: texto }).eq("id", messageId);
  }
```

Em `lib/data/memory-repository.ts`, logo abaixo de `setMessageMediaText`:

```ts
  async setMessageTraducao(messageId: string, texto: string) {
    for (const list of Array.from(this.messages.values())) {
      const m = list.find((x) => x.id === messageId);
      if (m) { m.traducaoPt = texto; return; }
    }
  }
```

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `npx vitest run tests/repository.memory.test.ts`
Esperado: PASSA, incluindo o teste novo.

- [ ] **Passo 5: Commit**

```bash
git add lib/domain/types.ts lib/data/repository.ts lib/data/supabase-repository.ts lib/data/memory-repository.ts tests/repository.memory.test.ts
git commit -m "A mensagem passa a carregar a tradução ao lado do original"
```

---

## Task 4: O módulo que traduz

**Files:**
- Create: `lib/agent/traducao.ts`
- Test: `tests/traducao.test.ts` (o mesmo da Task 2)

- [ ] **Passo 1: Escrever os testes que falham**

Acrescentar a `tests/traducao.test.ts`, logo após os imports existentes:

```ts
import { vi, afterEach } from "vitest";
import { interpretarTraducoes, traduzirParaPortugues } from "@/lib/agent/traducao";
```

e, no fim do arquivo:

```ts
/** Uma resposta do DeepSeek com o `content` que se quiser. */
function respostaCom(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }], usage: {} }),
    text: async () => "",
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("interpretarTraducoes", () => {
  it("aceita a resposta com a mesma quantidade que entrou", () => {
    const bruto = JSON.stringify({ traducoes: ["olá", "preciso de ajuda"] });
    expect(interpretarTraducoes(bruto, 2)).toEqual(["olá", "preciso de ajuda"]);
  });

  // EMPARELHAR ERRADO É PIOR DO QUE NÃO TRADUZIR: a tradução da mensagem 3 aparecendo
  // embaixo da 2 parece certa, e ninguém confere.
  it("descarta a leva inteira quando volta quantidade diferente", () => {
    const bruto = JSON.stringify({ traducoes: ["olá"] });
    expect(interpretarTraducoes(bruto, 2)).toBeUndefined();
  });

  it("descarta quando a resposta não é o JSON pedido", () => {
    expect(interpretarTraducoes("Claro! Aqui está a tradução: olá", 1)).toBeUndefined();
  });

  it("descarta quando algum item não é texto", () => {
    const bruto = JSON.stringify({ traducoes: ["olá", 42] });
    expect(interpretarTraducoes(bruto, 2)).toBeUndefined();
  });
});

describe("traduzirParaPortugues", () => {
  it("devolve a tradução casada com o id de cada mensagem", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      respostaCom(JSON.stringify({ traducoes: ["olá", "preciso de ajuda"] })),
    ));
    const mapa = await traduzirParaPortugues(
      [{ id: "m1", texto: "hola" }, { id: "m2", texto: "necesito ayuda" }],
      "es",
    );
    expect(mapa.get("m1")).toBe("olá");
    expect(mapa.get("m2")).toBe("preciso de ajuda");
  });

  it("não gasta chamada quando não há texto para traduzir", async () => {
    const chamada = vi.fn(async () => respostaCom(JSON.stringify({ traducoes: [] })));
    vi.stubGlobal("fetch", chamada);
    const mapa = await traduzirParaPortugues([{ id: "m1", texto: "   " }], "es");
    expect(mapa.size).toBe(0);
    expect(chamada).not.toHaveBeenCalled();
  });

  // NUNCA LANÇA: falhar aqui não pode custar a conversa, que é o que importa na tela.
  it("devolve mapa vazio quando o modelo falha", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("rede"); }));
    const mapa = await traduzirParaPortugues([{ id: "m1", texto: "hola" }], "es");
    expect(mapa.size).toBe(0);
  });

  it("devolve mapa vazio quando a quantidade não bate", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      respostaCom(JSON.stringify({ traducoes: ["olá"] })),
    ));
    const mapa = await traduzirParaPortugues(
      [{ id: "m1", texto: "hola" }, { id: "m2", texto: "necesito ayuda" }],
      "es",
    );
    expect(mapa.size).toBe(0);
  });

  // O CUSTO TEM DE CHEGAR EM MÉTRICAS COM O NOME CERTO. `registrarChamada` engole
  // exceção de propósito, então um tipo inválido não daria erro nenhum — daria um custo
  // que some. Na suíte o repositório é o de memória, e dá para ler o que foi gravado.
  it("registra a chamada como tradução", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      respostaCom(JSON.stringify({ traducoes: ["olá"] })),
    ));
    await traduzirParaPortugues([{ id: "m1", texto: "hola" }], "es", "conv-1");
    // registrarChamada é disparado sem await (`void`): deixa o microtask rodar.
    await new Promise((r) => setTimeout(r, 0));

    const { getRepository } = await import("@/lib/data");
    const chamadas = await getRepository().listChamadasLlm({});
    const nossa = chamadas.find((c) => c.conversationId === "conv-1");
    expect(nossa?.tipo).toBe("traducao");
    expect(nossa?.ok).toBe(true);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run tests/traducao.test.ts`
Esperado: FALHA — `Cannot find module '@/lib/agent/traducao'`.

- [ ] **Passo 3: Escrever o módulo**

Criar `lib/agent/traducao.ts`:

```ts
// A CONVERSA EM PORTUGUÊS, PARA QUEM VAI DECIDIR O CASO.
//
// A Ana responde na língua de quem escreveu — é a REGRA ABSOLUTA 1 do prompt, e ela está
// certa. O efeito colateral acontece do lado de dentro: quem abre a conversa no painel
// precisa ler o caso inteiro numa língua que não é a dele, e não é só o que o cliente
// escreveu — é também o que a Ana respondeu.
//
// TRÊS DECISÕES QUE PARECEM DETALHE E NÃO SÃO:
//
//   1. UMA CHAMADA POR CONVERSA, não uma por mensagem. O custo é dominado pelo tamanho do
//      prompt; vinte chamadas de uma linha custam muito mais que uma de vinte linhas.
//   2. NA DÚVIDA, NADA. Se a resposta do modelo não vier exatamente com a quantidade que
//      foi pedida, a leva inteira é descartada. Tradução emparelhada com a mensagem
//      errada parece certa — e ninguém confere o que parece certo.
//   3. NUNCA LANÇA. Falhar aqui pode custar uma tradução; não pode custar a conversa, que
//      é o que a pessoa abriu a tela para ler.

import { env } from "@/lib/env";
import { registrarChamada, tokensDe, type UsoDeTokens } from "@/lib/custos/registro";
import { NOME_DO_IDIOMA } from "@/lib/domain/idiomas";

export interface TextoParaTraduzir {
  /** O id da mensagem. Volta como chave do mapa — é o que casa tradução e balão. */
  id: string;
  texto: string;
}

// Traduções são mais longas que os originais em português; o teto existe só para uma
// conversa muito longa não estourar a resposta no meio.
const MAX_TOKENS = 4096;

function instrucao(idiomaOrigem?: string | null): string {
  const nome = idiomaOrigem ? NOME_DO_IDIOMA[idiomaOrigem] : undefined;
  const de = nome ? ` do ${nome}` : "";
  return (
    `Você traduz${de} para o português do Brasil mensagens de WhatsApp de um atendimento ` +
    "jurídico de imigração. Recebe um JSON com a lista `textos` e responde APENAS um JSON " +
    'no formato {"traducoes": ["...", "..."]}, com EXATAMENTE a mesma quantidade de itens ' +
    "e na mesma ordem. Traduza o sentido, não palavra por palavra, e mantenha nomes, " +
    "números de documento e datas exatamente como estão. Não resuma, não comente, não " +
    "acrescente nada fora do JSON. Texto já em português volta igual."
  );
}

/**
 * A lista de traduções, ou `undefined` quando a resposta não serve.
 *
 * Exige o formato pedido e a quantidade exata. Qualquer outra coisa é descartada inteira:
 * ver a decisão 2 no topo do arquivo.
 */
export function interpretarTraducoes(
  bruto: string | null | undefined,
  esperados: number,
): string[] | undefined {
  const limpo = (bruto ?? "").trim().replace(/^```(?:json)?|```$/g, "").trim();
  if (!limpo) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(limpo);
  } catch {
    return undefined;
  }
  const lista = (parsed as { traducoes?: unknown })?.traducoes;
  if (!Array.isArray(lista)) return undefined;
  if (lista.length !== esperados) return undefined;
  if (!lista.every((t) => typeof t === "string")) return undefined;
  return lista as string[];
}

/**
 * Traduz uma leva de mensagens. Devolve `id → tradução`, e um mapa VAZIO em qualquer
 * falha — nunca lança.
 */
export async function traduzirParaPortugues(
  textos: TextoParaTraduzir[],
  idiomaOrigem?: string | null,
  conversationId?: string,
): Promise<Map<string, string>> {
  const vazio = new Map<string, string>();
  const alvos = textos.filter((t) => (t.texto ?? "").trim().length > 0);
  if (alvos.length === 0) return vazio;

  const inicio = Date.now();
  const contabilizar = (uso: UsoDeTokens | undefined, ok: boolean, erro?: string) => {
    const { entrada, saida } = tokensDe(uso);
    void registrarChamada({
      provedor: "deepseek",
      modelo: env.deepseekModel,
      tipo: "traducao",
      conversationId,
      tokensEntrada: entrada,
      tokensSaida: saida,
      duracaoMs: Date.now() - inicio,
      ok,
      erro,
    });
  };

  try {
    const res = await fetch(`${env.deepseekBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.deepseekKey}`,
      },
      body: JSON.stringify({
        model: env.deepseekModel,
        messages: [
          { role: "system", content: instrucao(idiomaOrigem) },
          { role: "user", content: JSON.stringify({ textos: alvos.map((t) => t.texto) }) },
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0,
      }),
    });
    if (!res.ok) {
      contabilizar(undefined, false, `HTTP ${res.status}`);
      return vazio;
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: UsoDeTokens;
    };
    const traducoes = interpretarTraducoes(data.choices?.[0]?.message?.content, alvos.length);
    if (!traducoes) {
      contabilizar(data.usage, false, "resposta fora do formato ou com quantidade diferente");
      return vazio;
    }
    contabilizar(data.usage, true);
    const mapa = new Map<string, string>();
    alvos.forEach((t, i) => mapa.set(t.id, traducoes[i]));
    return mapa;
  } catch (err) {
    contabilizar(undefined, false, err instanceof Error ? err.message : "rede");
    return vazio;
  }
}
```

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `npx vitest run tests/traducao.test.ts`
Esperado: PASSA — 12 testes.

- [ ] **Passo 5: Commit**

```bash
git add lib/agent/traducao.ts tests/traducao.test.ts
git commit -m "O módulo que traduz a conversa, e desiste inteiro quando desconfia"
```

---

## Task 5: A rota que traduz o que falta

**Files:**
- Create: `app/api/conversations/[id]/traducao/route.ts`
- Test: `tests/traducao-rota.test.ts`

O teste exercita a **regra** da rota (o que traduzir, o que não traduzir) por uma função
pura exportada do próprio arquivo da rota — o mesmo recorte usado em
`lib/agent/ativacao.ts`, onde a decisão vive separada do handler.

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/traducao-rota.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pendentesDeTraducao } from "@/app/api/conversations/[id]/traducao/route";
import type { Message } from "@/lib/domain/types";

const msg = (over: Partial<Message>): Message => ({
  id: "m", conversationId: "c", role: "user", content: "hola",
  createdAt: "2026-08-28T03:00:00Z", ...over,
});

// A ECONOMIA INTEIRA DESTA FUNCIONALIDADE ESTÁ AQUI: só se paga pelo que ainda não foi
// traduzido. Reabrir a mesma conversa não pode gerar chamada nenhuma.
describe("pendentesDeTraducao", () => {
  it("pega as mensagens sem tradução", () => {
    const pend = pendentesDeTraducao([msg({ id: "m1" }), msg({ id: "m2" })]);
    expect(pend.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("ignora as que já têm tradução guardada", () => {
    const pend = pendentesDeTraducao([
      msg({ id: "m1", traducaoPt: "olá" }),
      msg({ id: "m2" }),
    ]);
    expect(pend.map((m) => m.id)).toEqual(["m2"]);
  });

  it("ignora mensagem sem texto (só anexo)", () => {
    const pend = pendentesDeTraducao([msg({ id: "m1", content: "   " })]);
    expect(pend).toEqual([]);
  });

  it("traduz também o que a Ana respondeu", () => {
    const pend = pendentesDeTraducao([msg({ id: "m1", role: "assistant", content: "hola, soy Ana" })]);
    expect(pend.map((m) => m.id)).toEqual(["m1"]);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run tests/traducao-rota.test.ts`
Esperado: FALHA — `Cannot find module '@/app/api/conversations/[id]/traducao/route'`.

- [ ] **Passo 3: Escrever a rota**

Criar `app/api/conversations/[id]/traducao/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { requireSession } from "@/lib/auth/guard";
import { traduzirParaPortugues } from "@/lib/agent/traducao";
import type { Message } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

// TRADUZIR O QUE FALTA, E SÓ.
//
// Chamada quando alguém ABRE uma conversa que não é em português. A tradução fica gravada
// na mensagem, então a segunda abertura da mesma conversa não gera chamada nenhuma — e
// conversa que ninguém abre nunca custa nada. Foi esta a razão de não traduzir na chegada,
// no webhook: lá se pagaria por toda conversa, inclusive as que ninguém vai ler.

/**
 * As mensagens que ainda precisam de tradução.
 *
 * Inclui as da Ana de propósito: ela responde na língua do cliente, então sem elas metade
 * do diálogo continua ilegível para quem vai decidir o caso. Mensagem sem texto (só anexo)
 * fica de fora — não há o que traduzir, e ela custaria um item na leva.
 */
export function pendentesDeTraducao(mensagens: Message[]): Message[] {
  return mensagens.filter((m) => !m.traducaoPt && (m.content ?? "").trim().length > 0);
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  // Dado de cliente: não se lê sem sessão.
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const repo = getRepository();
  const conv = await repo.getConversation(params.id);
  if (!conv) return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });

  // Sem idioma detectado o sistema NÃO CHUTA — é a mesma doutrina de lib/agent/idioma.ts.
  // E conversa em português não tem o que traduzir.
  if (!conv.idioma || conv.idioma === "pt") {
    return NextResponse.json({ traducoes: {} });
  }

  const mensagens = await repo.listMessages(params.id);
  const pendentes = pendentesDeTraducao(mensagens);

  const traducoes: Record<string, string> = {};
  for (const m of mensagens) {
    if (m.traducaoPt) traducoes[m.id] = m.traducaoPt;
  }
  if (pendentes.length === 0) return NextResponse.json({ traducoes });

  const novas = await traduzirParaPortugues(
    pendentes.map((m) => ({ id: m.id, texto: m.content })),
    conv.idioma,
    params.id,
  );
  if (novas.size === 0) {
    return NextResponse.json({ error: "traducao_indisponivel", traducoes }, { status: 502 });
  }

  for (const [id, texto] of Array.from(novas.entries())) {
    await repo.setMessageTraducao(id, texto);
    traducoes[id] = texto;
  }
  return NextResponse.json({ traducoes });
}
```

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `npx vitest run tests/traducao-rota.test.ts`
Esperado: PASSA — 4 testes.

- [ ] **Passo 5: Rodar a suíte inteira**

Rodar: `npm test`
Esperado: todos os arquivos passam. Se algum teste antigo quebrar por causa do campo novo
em `Message`, ele é o defeito — conserte antes de seguir.

- [ ] **Passo 6: Commit**

```bash
git add app/api/conversations/\[id\]/traducao/route.ts tests/traducao-rota.test.ts
git commit -m "A rota traduz o que falta, e só o que falta"
```

---

## Task 6: A tradução na tela

**Files:**
- Modify: `app/dashboard/conversations/[id]/page.tsx` — estado e efeito perto do bloco de
  `useEffect` do polling (por volta da linha 234) e o render do balão (linhas 517-570)

A página já é `"use client"` e já busca `GET /api/conversations/[id]` a cada 3 segundos.
A tradução gravada volta dentro de `Message`, então **não é preciso caminho de dados
novo**: basta disparar o POST uma vez e deixar o polling trazer o resultado.

- [ ] **Passo 1: Acrescentar o estado e o efeito**

Logo abaixo do `useEffect` que faz o polling (o que termina em `}, [id]);` por volta da
linha 258), inserir:

```tsx
  // A TRADUÇÃO DA CONVERSA.
  //
  // Dispara uma vez por abertura, em segundo plano, e só quando há mensagem sem tradução.
  // O resultado NÃO é lido daqui: ele é gravado na mensagem e chega pelo polling acima —
  // um caminho de dados só, em vez de dois estados que podem divergir.
  //
  // Em segundo plano de propósito: abrir a conversa é justamente quando alguém está com
  // pressa, e esperar o modelo para pintar a tela troca um problema por outro.
  const [traducaoFalhou, setTraducaoFalhou] = useState(false);
  const traducaoPedida = useRef(false);
  const conversation = data?.conversation;
  const messages = data?.messages ?? [];
  const precisaTraduzir =
    Boolean(conversation?.idioma) &&
    conversation?.idioma !== "pt" &&
    messages.some((m) => !m.traducaoPt && (m.content ?? "").trim().length > 0);

  async function traduzir() {
    setTraducaoFalhou(false);
    try {
      const res = await fetch(`/api/conversations/${id}/traducao`, { method: "POST" });
      if (!res.ok) setTraducaoFalhou(true);
    } catch {
      setTraducaoFalhou(true);
    }
  }

  useEffect(() => {
    if (!precisaTraduzir || traducaoPedida.current) return;
    traducaoPedida.current = true;
    void traduzir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precisaTraduzir, id]);
```

> Se `conversation` e `messages` já estiverem declarados no componente, **não redeclare**:
> use os que existem e mantenha só o `useState`, o `useRef`, o `precisaTraduzir`, a função
> `traduzir` e o `useEffect`.

- [ ] **Passo 2: Mostrar a tradução embaixo do balão**

No `messages.map`, logo **depois** do `</div>` que fecha o balão e **antes** do parágrafo
com `{isUser ? "Cliente" : "Agente"} · {fmtTime(m.createdAt)}`, inserir:

```tsx
                      {/* A TRADUÇÃO ANDA AO LADO DO ORIGINAL, NUNCA NO LUGAR DELE.
                          É um caso de imigração: o que a pessoa escreveu é a fonte, e
                          alguém vai precisar conferir a palavra exata algum dia. O rótulo
                          existe para que ninguém confunda máquina com pessoa. */}
                      {m.traducaoPt ? (
                        <div
                          className={`mt-1 rounded-xl border border-dashed border-ib-line bg-ib-papel px-3 py-2 ${
                            isUser ? "text-right" : "text-left"
                          }`}
                        >
                          <p className="font-mono text-[10px] uppercase tracking-wide text-ib-slate">
                            tradução automática
                          </p>
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ib-slate">
                            {m.traducaoPt}
                          </p>
                        </div>
                      ) : null}
```

- [ ] **Passo 3: Mostrar a falha, sem esconder a conversa**

Logo **depois** do fechamento do `messages.map(...)` (a linha `)}` que fecha o ternário do
`messages.length === 0`), inserir:

```tsx
            {/* Falhar a tradução não pode custar a conversa: o original continua inteiro
                acima, e aqui fica só o aviso e o caminho de volta. */}
            {traducaoFalhou ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-ib-line bg-ib-papel px-3 py-2 text-xs text-ib-slate">
                <span>Não consegui traduzir esta conversa agora.</span>
                <button
                  type="button"
                  onClick={() => { traducaoPedida.current = false; void traduzir(); }}
                  className="font-semibold text-ib-mar underline underline-offset-2"
                >
                  Tentar de novo
                </button>
              </div>
            ) : null}
```

- [ ] **Passo 4: Conferir que compila e que a suíte segue verde**

Rodar: `npx tsc --noEmit`
Esperado: sem erros.

Rodar: `npm test`
Esperado: todos passam.

- [ ] **Passo 5: Ver funcionando de verdade**

Rodar: `npm run dev`

Abrir uma conversa em espanhol no painel (a de 28/08 com a Yulimar serve) e conferir, nesta
ordem:

1. a conversa aparece **na hora**, em espanhol;
2. em alguns segundos, cada balão ganha embaixo o bloco *tradução automática*;
3. recarregar a página: as traduções aparecem **imediatamente** e nenhuma chamada nova é
   feita (conferir em `/dashboard/metricas` que a contagem de `tradução` não subiu).

- [ ] **Passo 6: Commit**

```bash
git add app/dashboard/conversations/\[id\]/page.tsx
git commit -m "A conversa em outra língua passa a ser legível para quem decide o caso"
```

---

## Conferência final

- [ ] `npm test` — suíte inteira verde
- [ ] `npx tsc --noEmit` — sem erros de tipo
- [ ] `npm run lint` — sem erros novos
- [ ] `/dashboard/metricas` mostra a linha **tradução** com custo próprio
- [ ] Uma conversa em português **não** dispara chamada nenhuma
