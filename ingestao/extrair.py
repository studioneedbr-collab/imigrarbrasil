#!/usr/bin/env python3
"""Etapa 1 — PDF -> páginas limpas em JSON.

Uso:  python3 extrair.py [id_da_fonte ...]     (sem argumento = todas)
Requer: pdftotext (brew install poppler)
"""
import json, subprocess, sys, shutil
from pathlib import Path

import texto as T

RAIZ = Path(__file__).resolve().parent
# Os PDFs vivem em material-oficial/, na raiz do repositório. Ficaram soltos na raiz até
# 26/08/2026, com nome de arquivo em caixa alta e espaço — o que obrigava a citar cada um
# entre aspas em qualquer comando e escondia o resto da estrutura.
PDFS = RAIZ.parent / "material-oficial"
SAIDA = RAIZ / "out" / "paginas"


def paginas_do_pdf(caminho: Path, primeira: int, ultima: int) -> list[str]:
    r = subprocess.run(
        ["pdftotext", "-q", "-f", str(primeira), "-l", str(ultima), str(caminho), "-"],
        capture_output=True, text=True, check=True,
    )
    return r.stdout.split("\f")


def total_paginas(caminho: Path) -> int:
    r = subprocess.run(["pdfinfo", str(caminho)], capture_output=True, text=True, check=True)
    for linha in r.stdout.splitlines():
        if linha.startswith("Pages:"):
            return int(linha.split()[1])
    raise RuntimeError(f"pdfinfo não retornou Pages para {caminho.name}")


def extrair(fonte: dict) -> dict:
    pdf = PDFS / fonte["arquivo"]
    if not pdf.exists():
        raise FileNotFoundError(pdf)
    limite = total_paginas(pdf)

    brutas: list[tuple[int, str]] = []
    for primeira, ultima in fonte["paginas"]:
        ultima = min(ultima, limite)
        for deslocamento, conteudo in enumerate(paginas_do_pdf(pdf, primeira, ultima)):
            numero = primeira + deslocamento
            if numero <= ultima:
                brutas.append((numero, conteudo))

    repetidas = T.descobrir_repetidas([c for _, c in brutas])
    paginas, descartadas = [], {"sumario": 0, "vazia": 0, "idioma": 0}

    for numero, conteudo in brutas:
        limpo = T.limpar_pagina(conteudo, repetidas)
        if len(limpo.strip()) < 120:
            descartadas["vazia"] += 1
            continue
        if T.e_sumario(conteudo):
            descartadas["sumario"] += 1
            continue
        idioma = T.detectar_idioma(limpo)
        if idioma in ("ar", "en", "fr", "es") and fonte["id"] != "refugio":
            descartadas["idioma"] += 1
            continue
        paginas.append({"pagina": numero, "idioma": idioma, "texto": T.juntar_paragrafos(limpo)})

    return {
        "fonte": fonte["id"],
        "titulo": fonte["titulo"],
        "colecao": fonte["colecao"],
        "estrutura": fonte["estrutura"],
        "orgao": fonte["orgao"],
        "atualizado_em": fonte["atualizado_em"],
        "alerta_desatualizacao": fonte.get("alerta_desatualizacao"),
        "temas": fonte["temas"],
        "secoes_manuais": fonte.get("secoes_manuais"),
        "cabecalhos_removidos": sorted(repetidas),
        "descartadas": descartadas,
        "paginas": paginas,
    }


def main(argv: list[str]) -> int:
    if not shutil.which("pdftotext"):
        print("erro: pdftotext não encontrado. Instale com `brew install poppler`.", file=sys.stderr)
        return 1
    fontes = json.loads((RAIZ / "fontes.json").read_text())["fontes"]
    if argv:
        fontes = [f for f in fontes if f["id"] in argv]
        if not fontes:
            print(f"erro: nenhuma fonte com id em {argv}", file=sys.stderr)
            return 1
    SAIDA.mkdir(parents=True, exist_ok=True)
    for fonte in fontes:
        doc = extrair(fonte)
        destino = SAIDA / f"{fonte['id']}.json"
        destino.write_text(json.dumps(doc, ensure_ascii=False, indent=1))
        d = doc["descartadas"]
        print(f"{fonte['id']:<14} {len(doc['paginas']):>4} páginas  "
              f"(descartadas: {d['sumario']} sumário, {d['vazia']} vazias, {d['idioma']} outro idioma)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
