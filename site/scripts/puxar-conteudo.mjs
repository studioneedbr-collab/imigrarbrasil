// PUXA O CONTEÚDO DO PAINEL ANTES DO BUILD.
//
// Roda no GitHub Actions (.github/workflows/publicar-site.yml), antes do `astro build`:
// busca /api/site/exportar no painel e reescreve src/data/{posts,servicos,categorias,site}.json.
//
//   PAINEL_URL=https://painel… SITE_EXPORT_TOKEN=… node scripts/puxar-conteudo.mjs
//
// Sem PAINEL_URL, não faz nada: o build usa o JSON que está no repositório. Se o painel
// ainda não tem conteúdo (nada importado), também não toca em nada — publicar um site sem
// posts por causa de um banco vazio seria o pior jeito de descobrir que faltou importar.
//
// As imagens enviadas pelo painel (Supabase Storage) são BAIXADAS para public/uploads/,
// e o JSON passa a apontar para lá: o visitante carrega do domínio do site, e a imagem
// ganha WebP e cache como as outras.

import fs from "node:fs";
import path from "node:path";
import { comprimir } from "./comprimir-originais.mjs";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DADOS = path.join(RAIZ, "src/data");
const { PAINEL_URL, SITE_EXPORT_TOKEN } = process.env;

if (!PAINEL_URL) {
  console.log("PAINEL_URL vazio: usando o conteúdo que está no repositório.");
  process.exit(0);
}

const r = await fetch(`${PAINEL_URL.replace(/\/$/, "")}/api/site/exportar`, {
  headers: { "X-Imigrar-Token": SITE_EXPORT_TOKEN ?? "" },
});
if (!r.ok) {
  // Falhar ALTO: publicar o conteúdo velho achando que é o novo é pior do que não publicar.
  console.error(`O painel respondeu ${r.status} em /api/site/exportar: ${(await r.text()).slice(0, 300)}`);
  process.exit(1);
}
const dados = await r.json();
if (dados.vazio) {
  console.log("O painel ainda não tem conteúdo importado: usando o que está no repositório.");
  process.exit(0);
}

// ── imagens do Storage → public/uploads/painel/ ────────────────────────────────────
const baixadas = new Map();
async function localizar(url) {
  if (!url || !/^https:\/\/[^/]+\.supabase\.co\/storage\//.test(url)) return url;
  if (baixadas.has(url)) return baixadas.get(url);
  const nome = decodeURIComponent(url.split("/").pop()).replace(/[^a-zA-Z0-9._-]/g, "-");
  const destino = path.join(RAIZ, "public/uploads/painel", nome);
  if (!fs.existsSync(destino)) {
    const img = await fetch(url);
    if (!img.ok) { console.warn(`imagem não baixou (${img.status}): ${url}`); return url; }
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, Buffer.from(await img.arrayBuffer()));
    // Foto de celular enviada pelo painel chega com 4 MB; o site não precisa disso.
    if (/\.(jpe?g|png)$/i.test(destino)) await comprimir(destino);
  }
  const local = `/uploads/painel/${nome}`;
  baixadas.set(url, local);
  return local;
}
async function localizarNoHtml(html) {
  if (!html) return html;
  let out = html;
  for (const m of html.matchAll(/src="(https:\/\/[^"]+\.supabase\.co\/storage\/[^"]+)"/g)) {
    out = out.replace(m[1], await localizar(m[1]));
  }
  return out;
}

const salvar = (nome, v) => fs.writeFileSync(path.join(DADOS, `${nome}.json`), JSON.stringify(v, null, 2) + "\n");

if (dados.posts?.length) {
  for (const p of dados.posts) { p.image = await localizar(p.image); p.html = await localizarNoHtml(p.html); }
  salvar("posts", dados.posts);
}

if (dados.servicos?.length) {
  for (const s of dados.servicos) {
    s.image = await localizar(s.image);
    for (const c of ["html", "paraQuem", "fechamento"]) s[c] = await localizarNoHtml(s[c]);
  }
  salvar("servicos", dados.servicos);

  // As categorias são as que já existem (com imagem e texto próprios); a lista de
  // serviços de cada uma é refeita pelo campo `categoria` de cada serviço.
  const categorias = JSON.parse(fs.readFileSync(path.join(DADOS, "categorias.json"), "utf8"));
  const norm = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "e").replace(/\s+/g, " ").trim();
  for (const c of categorias) c.servicos = [];
  const sobra = [];
  for (const s of dados.servicos) {
    const c = categorias.find((x) => norm(x.nome) === norm(s.categoria));
    if (c) c.servicos.push(s.slug); else sobra.push(`${s.slug} (${s.categoria})`);
  }
  if (sobra.length) console.warn(`Serviços com categoria desconhecida (não aparecem na lista): ${sobra.join(", ")}`);
  salvar("categorias", categorias);
}

if (dados.config) salvar("site", dados.config);

console.log(`Conteúdo do painel: ${dados.posts?.length ?? 0} posts, ${dados.servicos?.length ?? 0} serviços, ${baixadas.size} imagens baixadas.`);
