// Gera foto.jpg.webp ao lado de cada JPG/PNG de public/ (máx. 1600px de largura).
//
// O HTML continua apontando para o .jpg/.png — são as URLs que o Google Imagens já
// indexou. Quem troca é o nginx: se o navegador aceita WebP e existe o .webp, ele entrega
// o .webp no mesmo endereço (deploy/vhost-cloudpanel.conf). Nada de <picture> no HTML.
//
// O nome é "foto.jpg.webp", e não "foto.webp", porque 2.png e 2.jpg existem lado a lado
// e virariam o mesmo arquivo.
//
//   npm run imagens          # só o que ainda não tem .webp
//   npm run imagens -- --tudo
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../public");
const tudo = process.argv.includes("--tudo");
let antes = 0, depois = 0, n = 0;

function* arquivos(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* arquivos(p);
    else if (/\.(jpe?g|png)$/i.test(e.name)) yield p;
  }
}

for (const arq of arquivos(RAIZ)) {
  const webp = arq + ".webp";
  if (!tudo && fs.existsSync(webp)) continue;
  await sharp(arq).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 78 }).toFile(webp);
  antes += fs.statSync(arq).size;
  depois += fs.statSync(webp).size;
  n++;
}
const mb = (b) => (b / 1048576).toFixed(1) + " MB";
console.log(`${n} imagens: ${mb(antes)} → ${mb(depois)} em WebP`);
