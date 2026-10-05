// Gera o contorno do mapa-múndi do fundo da home (public/mapa-terra.svg) e as medidas dele
// (src/data/mapa.json), usados por src/components/Mapa.astro.
//
//   node scripts/gerar-mapa.mjs
//
// Contornos de world-atlas (Natural Earth, domínio público), projeção equiretangular e
// coordenadas inteiras: o arquivo fica com ~30 KB e o navegador guarda em cache.
import fs from "node:fs";
import { createRequire } from "node:module";
import { feature } from "topojson-client";
const require = createRequire(import.meta.url);
const mundo = require("world-atlas/land-110m.json");
const terra = feature(mundo, mundo.objects.land);

// Recorte: sem a Antártida (abaixo de -58°) e sem o extremo norte.
const L = 1000, NORTE = 78, SUL = -58;
const A = Math.round((L * (NORTE - SUL)) / 360);
const x = (lon) => Math.round(((lon + 180) / 360) * L);
const y = (lat) => Math.round(((NORTE - lat) / (NORTE - SUL)) * A);

let d = "";
for (const poligono of terra.features[0].geometry.coordinates) {
  for (const anel of poligono) {
    // A Antártida fica de fora: recortada, ela vira uma faixa reta no pé do mapa.
    if (Math.max(...anel.map(([, lat]) => lat)) < -55) continue;
    let pts = [];
    const fechar = () => { if (pts.length >= 4) d += "M" + pts.map(([a, b]) => `${a} ${b}`).join("L"); pts = []; };
    for (const [lon, lat] of anel) {
      const p = [x(lon), y(Math.max(lat, SUL))];
      const u = pts[pts.length - 1];
      // Rússia e Fiji cruzam a linha de 180°: o salto de um lado ao outro do mapa viraria
      // um traço reto atravessando a tela. Ali o contorno recomeça, sem ligar os pontos.
      if (u && Math.abs(p[0] - u[0]) > L / 3) fechar();
      if (!u || u[0] !== p[0] || u[1] !== p[1]) pts.push(p);
    }
    fechar();
  }
}
fs.writeFileSync("src/data/mapa.json", JSON.stringify({ largura: L, altura: A, norte: NORTE, sul: SUL }));
// Cinza bem claro sobre o fundo branco, como no Corporate Profile.
fs.writeFileSync("public/mapa-terra.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${A}"><path fill="#dfe6ed" d="${d}"/></svg>`);
console.log(`mapa-terra.svg: ${(d.length / 1024).toFixed(1)} KB`);
