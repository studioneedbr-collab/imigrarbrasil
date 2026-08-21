#!/usr/bin/env python3
"""Etapa 2b — relatório de qualidade dos chunks + busca léxica local (BM25).

Uso:
  python3 validar.py                        # relatório + BM25 em todo o acervo
  python3 validar.py --colecao cartilha     # como o agente busca em produção
  python3 validar.py "sua pergunta aqui"

A busca aqui é léxica de propósito: roda sem API nenhuma e serve para conferir se os
CORTES fazem sentido. A recuperação multilíngue de verdade é a vetorial (buscar.py).
"""
import json, math, re, sys, unicodedata
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
CHUNKS = RAIZ / "out" / "chunks.jsonl"
PERGUNTAS = RAIZ / "perguntas.json"

ALVO, MAXIMO, MINIMO = 1200, 2200, 180
_PALAVRA = re.compile(r"[\wà-ÿ]{3,}")
_VAZIAS = set("que nao para uma dos das como com por ser sua seu pode deve qual quais onde quando".split())


def normalizar(t: str) -> list[str]:
    t = unicodedata.normalize("NFD", t.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return [p for p in _PALAVRA.findall(t) if p not in _VAZIAS]


class BM25:
    def __init__(self, documentos: list[list[str]], k1=1.5, b=0.75):
        self.k1, self.b = k1, b
        self.docs = documentos
        self.n = len(documentos)
        self.media = sum(len(d) for d in documentos) / max(self.n, 1)
        self.freq = [Counter(d) for d in documentos]
        aparicoes = Counter(p for d in documentos for p in set(d))
        self.idf = {p: math.log(1 + (self.n - n + 0.5) / (n + 0.5)) for p, n in aparicoes.items()}

    def buscar(self, consulta: list[str], k: int = 3):
        escores = []
        for i, freq in enumerate(self.freq):
            tamanho = len(self.docs[i])
            escore = 0.0
            for termo in consulta:
                if termo not in freq:
                    continue
                f = freq[termo]
                escore += self.idf[termo] * f * (self.k1 + 1) / (
                    f + self.k1 * (1 - self.b + self.b * tamanho / self.media))
            if escore:
                escores.append((escore, i))
        escores.sort(reverse=True)
        return escores[:k]


def relatorio(chunks: list[dict]) -> int:
    print(f"=== {len(chunks)} chunks\n")
    tamanhos = sorted(c["caracteres"] for c in chunks)
    p = lambda q: tamanhos[int(len(tamanhos) * q)]
    print(f"tamanho  p10 {p(.10)}  mediana {p(.50)}  p90 {p(.90)}  max {tamanhos[-1]}")

    problemas = 0
    curtos = [c for c in chunks if c["caracteres"] < MINIMO]
    longos = [c for c in chunks if c["caracteres"] > MAXIMO + 200]
    sem_titulo = [c for c in chunks if not c["titulo"] or c["titulo"] == c["documento"]]
    textos = Counter(c["texto"][:200] for c in chunks)
    duplicados = [t for t, n in textos.items() if n > 1]
    sem_data = [c for c in chunks if not c["atualizado_em"]]

    for rotulo, lista, teto in (("abaixo do mínimo", curtos, 0),
                               ("acima do teto", longos, 0),
                               ("sem título próprio", sem_titulo, len(chunks) * 0.35),
                               ("com início duplicado", duplicados, len(chunks) * 0.02),
                               ("sem data de atualização", sem_data, 0)):
        marca = "ok " if len(lista) <= teto else "!! "
        problemas += 0 if len(lista) <= teto else 1
        print(f"{marca}{rotulo}: {len(lista)}")

    print("\ncobertura de metadado:")
    for campo in ("secao", "diploma", "artigo", "alerta_desatualizacao"):
        n = sum(1 for c in chunks if c.get(campo))
        print(f"  {campo:<22} {n:>5} / {len(chunks)}")

    print("\npor coleção:")
    for colecao in sorted({c["colecao"] for c in chunks}):
        n = [c for c in chunks if c["colecao"] == colecao]
        print(f"  {colecao:<12} {len(n):>5} chunks  {sum(x['caracteres'] for x in n):>9,} car".replace(",", "."))
    return problemas


def testar_recuperacao(chunks: list[dict], consultas: list[dict]) -> None:
    indice = BM25([normalizar(c["texto_embed"]) for c in chunks])
    print("\n=== recuperação léxica (BM25 local, só valida os cortes)\n")
    acertos = testados = 0
    for caso in consultas:
        resultados = indice.buscar(normalizar(caso["pergunta"]), k=3)
        fontes = [chunks[i]["fonte"] for _, i in resultados]
        esperadas = set(caso.get("espera_fonte", []))
        ok = bool(esperadas & set(fontes))
        if caso["idioma"] == "pt":
            testados += 1
            acertos += ok
        marca = "ok" if ok else ("--" if caso["idioma"] != "pt" else "!!")
        print(f"[{marca}] ({caso['idioma']}) {caso['pergunta']}")
        for escore, i in resultados:
            c = chunks[i]
            print(f"       {escore:6.2f} {c['fonte']:<14} p{c['pagina_inicio']:<4} {c['titulo'][:64]}")
        print()
    print(f"acerto de fonte em português: {acertos}/{testados}")
    print("as linhas '--' são não-português: BM25 não cruza idioma. É esperado, e é")
    print("exatamente o motivo de a busca de produção ser vetorial multilíngue.")


def main(argv: list[str]) -> int:
    colecoes = []
    while len(argv) >= 2 and argv[0] == "--colecao":
        colecoes.append(argv[1])
        argv = argv[2:]
    if not CHUNKS.exists():
        print("erro: rode `python3 extrair.py && python3 chunk.py` primeiro.", file=sys.stderr)
        return 1
    chunks = [json.loads(l) for l in CHUNKS.read_text().splitlines() if l.strip()]
    problemas = relatorio(chunks)
    if colecoes:
        chunks = [c for c in chunks if c["colecao"] in colecoes]
        print(f"\nrecuperação restrita a {colecoes}: {len(chunks)} chunks")
    consultas = ([{"idioma": "pt", "pergunta": " ".join(argv)}] if argv
                 else json.loads(PERGUNTAS.read_text()))
    testar_recuperacao(chunks, consultas)
    return 1 if problemas else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
