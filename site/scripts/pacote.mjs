// GERA O ZIP PARA SUBIR NO CLOUDPANEL À MÃO.
//
//   npm run pacote
//
// Sai em pacote/imigrarbrasil-site-AAAA-MM-DD.zip: só o que o site usa (o conteúdo de
// dist/), sem código-fonte, sem node_modules, sem os scripts. No CloudPanel:
// File Manager → htdocs/imigrarbrasil.com → Upload do zip → Extract → apague o zip.
//
// Antes de zipar, confere que nada que não deve ir ao ar está em dist/ (arquivo de teste,
// de diagnóstico, segredo, mapa de código-fonte).
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIST = path.join(RAIZ, "dist");
const rodar = (c) => execSync(c, { cwd: RAIZ, stdio: "inherit" });

if (process.env.PAINEL_URL) rodar("node scripts/puxar-conteudo.mjs");
rodar("node scripts/comprimir-originais.mjs");
rodar("node scripts/otimizar-imagens.mjs");
rodar("npx astro build");

// O que nunca pode estar no ar.
const proibido = /(^|\/)(\.env|\.DS_Store|diag\.json|__teste|.*\.map$|imigrar-lead-config\.php|node_modules)/;
const arquivos = [];
const andar = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? andar(p) : arquivos.push(path.relative(DIST, p)); } };
andar(DIST);
const ruins = arquivos.filter((f) => proibido.test(f));
for (const f of ruins.filter((f) => f.endsWith(".DS_Store"))) fs.rmSync(path.join(DIST, f));
const graves = ruins.filter((f) => !f.endsWith(".DS_Store"));
if (graves.length) { console.error("Não empacotei: arquivos que não podem ir ao ar em dist/:\n  " + graves.join("\n  ")); process.exit(1); }
for (const f of ["index.html", "404.html", "robots.txt", "sitemap-index.xml", "api/lead.php"]) {
  if (!arquivos.includes(f)) { console.error(`Não empacotei: falta ${f} em dist/.`); process.exit(1); }
}

const data = new Date().toISOString().slice(0, 10);
fs.mkdirSync(path.join(RAIZ, "pacote"), { recursive: true });
const zip = path.join(RAIZ, "pacote", `imigrarbrasil-site-${data}.zip`);
fs.rmSync(zip, { force: true });
// -9 compressão máxima; -X sem metadados do macOS; JPG/PNG/WebP/woff2 já são comprimidos,
// então -n os guarda sem tentar de novo (mais rápido, mesmo tamanho).
execSync(`zip -r -9 -X -q -n .jpg:.jpeg:.png:.webp:.woff2:.gif "${zip}" . -x "*.DS_Store"`, { cwd: DIST });

const mb = (b) => (b / 1048576).toFixed(1) + " MB";
const tamDist = arquivos.reduce((s, f) => s + (fs.existsSync(path.join(DIST, f)) ? fs.statSync(path.join(DIST, f)).size : 0), 0);
console.log(`\n${path.relative(RAIZ, zip)}: ${mb(fs.statSync(zip).size)} (${arquivos.length} arquivos, ${mb(tamDist)} descompactado)`);
