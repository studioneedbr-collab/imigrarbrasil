import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { postSchema, servicoSchema, configSchema, limparHtmlDoSite, minutosDeLeitura } from "@/lib/site/conteudo";
import { resumirSite, ehContato, rotuloDoAlvo } from "@/lib/site/resumo";
import { CATEGORIAS_SITE } from "@/lib/site/categorias";
import type { EventoSite } from "@/lib/site/conteudo";

/**
 * O PAINEL E O SITE FALAM O MESMO JSON?
 *
 * O site (../site) lê src/data/*.json; o painel valida com os schemas de lib/site/conteudo.
 * Se um dos dois mudar o formato sozinho, a importação recusa conteúdo real — ou pior, o
 * build publica um campo que o site não sabe ler. Este teste roda os arquivos de verdade
 * do site pelos schemas do painel.
 */
const DADOS = join(process.cwd(), "..", "site", "src", "data");
const ler = (f: string) => JSON.parse(readFileSync(join(DADOS, f), "utf8"));
const temSite = existsSync(DADOS);

describe.skipIf(!temSite)("o conteúdo atual do site passa pelos schemas do painel", () => {
  it("todos os posts", () => {
    const recusados = (ler("posts.json") as unknown[])
      .map((p) => ({ p, r: postSchema.safeParse(p) }))
      .filter((x) => !x.r.success)
      .map((x) => `${(x.p as { slug: string }).slug}: ${x.r.error!.issues[0].path.join(".")} ${x.r.error!.issues[0].message}`);
    expect(recusados).toEqual([]);
  });
  it("todos os serviços, e cada um numa categoria que o painel conhece", () => {
    const servicos = ler("servicos.json") as { slug: string; categoria: string }[];
    const recusados = servicos.map((s) => ({ s, r: servicoSchema.safeParse(s) })).filter((x) => !x.r.success).map((x) => x.s.slug);
    expect(recusados).toEqual([]);
    for (const s of servicos) expect(CATEGORIAS_SITE as readonly string[], s.slug).toContain(s.categoria);
  });
  it("a configuração", () => {
    const r = configSchema.safeParse(ler("site.json"));
    expect(r.success ? null : r.error.issues).toBeNull();
  });
  it("as categorias do painel são as mesmas do site", () => {
    const doSite = (ler("categorias.json") as { nome: string }[]).map((c) => c.nome).sort();
    expect(doSite).toEqual([...CATEGORIAS_SITE].sort());
  });
});

describe("limparHtmlDoSite", () => {
  it("tira script, atributos de evento e javascript:", () => {
    const sujo = `<p onclick="x()">oi</p><script>alert(1)</script><a href="javascript:alert(1)">l</a><img src="a.jpg" onerror="x()">`;
    const limpo = limparHtmlDoSite(sujo);
    expect(limpo).not.toMatch(/script|onclick|onerror|javascript:/i);
    expect(limpo).toContain("<p>oi</p>");
  });
  it("mantém vídeo do YouTube e remove iframe de outro lugar", () => {
    expect(limparHtmlDoSite(`<iframe src="https://www.youtube.com/embed/x"></iframe>`)).toContain("youtube");
    expect(limparHtmlDoSite(`<iframe src="https://malicioso.com"></iframe>`)).toBe("");
  });
  it("mantém a estrutura do artigo", () => {
    const html = `<h2>Prazo</h2><p>Texto <strong>forte</strong></p><ul><li>a</li></ul>`;
    expect(limparHtmlDoSite(html)).toBe(html);
  });
});

describe("resumirSite", () => {
  const ev = (tipo: EventoSite["tipo"], extra: Partial<EventoSite> = {}): EventoSite => ({
    tipo, alvo: null, pagina: "/", idioma: "pt", pais: "BR", dispositivo: "celular", origem: null, criadoEm: new Date().toISOString(), ...extra,
  });
  it("contato é WhatsApp ou formulário; outro clique não", () => {
    expect(ehContato(ev("clique", { alvo: "whatsapp" }))).toBe(true);
    expect(ehContato(ev("formulario"))).toBe(true);
    expect(ehContato(ev("clique", { alvo: "cta:hero-servicos" }))).toBe(false);
  });
  it("calcula conversão e ranking", () => {
    const r = resumirSite([
      ev("visita", { pagina: "/" }), ev("visita", { pagina: "/" }), ev("visita", { pagina: "/blog-imigracao-brasil/" }), ev("visita"),
      ev("clique", { alvo: "whatsapp" }), ev("formulario"), ev("clique", { alvo: "cta:topo" }),
    ], 7);
    expect(r.visitas).toBe(4);
    expect(r.conversao).toBe(0.5);
    expect(r.paginas[0]).toEqual({ chave: "/", n: 3 });
    expect(r.porDia).toHaveLength(7);
    expect(r.porDia.at(-1)!.contatos).toBe(2);
  });
  it("dias sem evento aparecem zerados", () => {
    expect(resumirSite([], 30).porDia.every((d) => d.visitas === 0)).toBe(true);
  });
  it("rótulo legível dos alvos", () => {
    expect(rotuloDoAlvo("whatsapp")).toBe("WhatsApp");
    expect(rotuloDoAlvo("cta:topo")).toBe("Botão: topo");
    expect(rotuloDoAlvo("servico:visto-nomade")).toBe("Serviço: visto-nomade");
  });
});

it("minutos de leitura nunca é zero", () => {
  expect(minutosDeLeitura("<p>oi</p>")).toBe(1);
  expect(minutosDeLeitura(`<p>${"palavra ".repeat(1000)}</p>`)).toBe(5);
});
