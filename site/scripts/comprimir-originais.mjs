// Comprime os JPG/PNG de public/ NO MESMO ARQUIVO (mesmo nome, mesmo formato — a URL é
// a que o Google indexou). Largura máxima 1600px. Só troca se ficar menor.
//
// Rode ao acrescentar imagens à mão em public/. As que vêm pelo painel passam por aqui no
// build (scripts/puxar-conteudo.mjs chama comprimir()).
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

export async function comprimir(arq) {
  const antes = fs.statSync(arq).size;
  const img = sharp(arq).rotate().resize({ width: 1600, withoutEnlargement: true });
  const buf = /\.png$/i.test(arq)
    ? await img.png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 }).toBuffer()
    : await img.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  if (buf.length < antes * 0.95) { fs.writeFileSync(arq, buf); return antes - buf.length; }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../public");
  let ganho = 0, n = 0;
  const andar = async (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await andar(p);
      else if (/\.(jpe?g|png)$/i.test(e.name)) { const g = await comprimir(p); if (g) { ganho += g; n++; } }
    }
  };
  await andar(RAIZ);
  console.log(`${n} imagens comprimidas, ${(ganho / 1048576).toFixed(1)} MB a menos`);
}
