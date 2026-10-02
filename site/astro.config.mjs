// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import fs from "node:fs";

// Saída: HTML estático em dist/, uma pasta por URL (/quem-somos/index.html) — o formato
// que o nginx do CloudPanel serve sem regra nenhuma. As URLs são AS MESMAS do WordPress,
// com a barra no fim: é nelas que está o posicionamento no Google.

// <lastmod> de verdade no sitemap: é por ele que o Google decide o que reindexar primeiro.
const ler = (f) => JSON.parse(fs.readFileSync(new URL(`./src/data/${f}.json`, import.meta.url), "utf8"));
const datas = new Map();
for (const p of ler("posts")) datas.set(`/${p.slug}/`, p.modified ?? p.published);
for (const s of ler("servicos")) if (s.modified) datas.set(`/servico/${s.slug}/`, s.modified);
const maisRecente = [...datas.values()].sort().at(-1);

export default defineConfig({
  site: "https://imigrarbrasil.com",
  trailingSlash: "always",
  build: { format: "directory", inlineStylesheets: "auto" },
  compressHTML: true,
  integrations: [
    sitemap({
      filter: (url) => !/\/(email-enviado-com-sucesso|404)\/?$/.test(url) && !new URL(url).pathname.startsWith("/admin/"),
      serialize(item) {
        const caminho = new URL(item.url).pathname;
        const data = datas.get(caminho);
        // Listagens mudam quando entra post novo: herdam a data do post mais recente.
        const listagem = caminho === "/" || caminho.startsWith("/blog-imigracao-brasil/");
        if (data) item.lastmod = new Date(data).toISOString();
        else if (listagem && maisRecente) item.lastmod = new Date(maisRecente).toISOString();
        item.changefreq = data ? "monthly" : listagem ? "weekly" : "monthly";
        item.priority = caminho === "/" ? 1 : caminho.startsWith("/servico/") || caminho === "/nossos-servicos/" ? 0.9 : data ? 0.8 : 0.6;
        return item;
      },
    }),
  ],
});
