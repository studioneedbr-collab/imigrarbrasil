#!/usr/bin/env python3
"""Etapa 3 — chunks -> embeddings -> Supabase/pgvector. Só stdlib.

Uso:
  python3 embed_upsert.py --estimativa          # custo/tokens, sem rede
  python3 embed_upsert.py --fonte regularizacao # sobe uma fonte só
  python3 embed_upsert.py                       # sobe tudo

Variáveis de ambiente:
  EMBEDDINGS_PROVIDER   openai | tei        (padrão: openai)
  EMBEDDINGS_MODEL      padrão: text-embedding-3-large
  EMBEDDINGS_DIM        padrão: 1024        (precisa bater com o vector(N) do SQL)
  OPENAI_API_KEY        provider=openai
  EMBEDDINGS_URL        provider=tei — endpoint do Text Embeddings Inference (BGE-M3)
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
import argparse, json, os, sys, time, urllib.error, urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
CHUNKS = RAIZ / "out" / "chunks.jsonl"

LOTE_EMBED = 64
LOTE_UPSERT = 100
COLUNAS = ("id fonte documento colecao orgao titulo secao diploma artigo temas idioma "
           "atualizado_em alerta_desatualizacao pagina_inicio pagina_fim ordem texto texto_embed").split()


def _post(url: str, corpo: dict, cabecalhos: dict, tentativas: int = 5):
    dados = json.dumps(corpo).encode()
    for tentativa in range(tentativas):
        req = urllib.request.Request(url, data=dados, headers=cabecalhos, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                bruto = r.read()
                return json.loads(bruto) if bruto else None
        except urllib.error.HTTPError as e:
            corpo_erro = e.read().decode()[:300]
            if e.code in (408, 409, 429, 500, 502, 503, 504) and tentativa < tentativas - 1:
                espera = 2 ** tentativa
                print(f"  {e.code} — nova tentativa em {espera}s ({corpo_erro})", file=sys.stderr)
                time.sleep(espera)
                continue
            raise RuntimeError(f"{e.code} em {url}: {corpo_erro}") from None
        except urllib.error.URLError as e:
            if tentativa < tentativas - 1:
                time.sleep(2 ** tentativa)
                continue
            raise RuntimeError(f"rede indisponível em {url}: {e.reason}") from None
    raise RuntimeError("tentativas esgotadas")


# ------------------------------------------------------------- embeddings
def embeddings(textos: list[str]) -> list[list[float]]:
    provedor = os.environ.get("EMBEDDINGS_PROVIDER", "openai")
    dim = int(os.environ.get("EMBEDDINGS_DIM", "1024"))
    if provedor == "openai":
        chave = _exigir("OPENAI_API_KEY")
        resposta = _post(
            "https://api.openai.com/v1/embeddings",
            {"model": os.environ.get("EMBEDDINGS_MODEL", "text-embedding-3-large"),
             "input": textos, "dimensions": dim},
            {"Authorization": f"Bearer {chave}", "Content-Type": "application/json"},
        )
        return [d["embedding"] for d in sorted(resposta["data"], key=lambda d: d["index"])]
    if provedor == "tei":
        # Text Embeddings Inference servindo BGE-M3 ou multilingual-e5-large.
        resposta = _post(_exigir("EMBEDDINGS_URL").rstrip("/") + "/embed",
                         {"inputs": textos, "normalize": True},
                         {"Content-Type": "application/json"})
        return resposta
    raise SystemExit(f"EMBEDDINGS_PROVIDER desconhecido: {provedor}")


def _exigir(nome: str) -> str:
    valor = os.environ.get(nome)
    if not valor:
        raise SystemExit(f"variável de ambiente ausente: {nome}")
    return valor


# ------------------------------------------------------------------ carga
def upsert(linhas: list[dict]) -> None:
    base = _exigir("SUPABASE_URL").rstrip("/")
    chave = _exigir("SUPABASE_SERVICE_ROLE_KEY")
    _post(f"{base}/rest/v1/rag_chunks?on_conflict=id", linhas,
          {"apikey": chave, "Authorization": f"Bearer {chave}",
           "Content-Type": "application/json",
           "Prefer": "resolution=merge-duplicates,return=minimal"})


def para_linha(chunk: dict, vetor: list[float]) -> dict:
    linha = {c: chunk.get(c) for c in COLUNAS}
    linha["embedding"] = "[" + ",".join(f"{v:.6f}" for v in vetor) + "]"
    return linha


# ------------------------------------------------------------- estimativa
def estimar(chunks: list[dict]) -> None:
    caracteres = sum(len(c["texto_embed"]) for c in chunks)
    tokens = caracteres / 3.6           # ~3,6 car/token em português
    print(f"{len(chunks)} chunks | {caracteres:,} caracteres | ~{tokens:,.0f} tokens".replace(",", "."))
    print("\ncusto de UMA indexação completa (a reindexação repete o valor):")
    for nome, preco in (("text-embedding-3-large", 0.13), ("text-embedding-3-small", 0.02)):
        print(f"  {nome:<24} US$ {tokens / 1_000_000 * preco:.4f}")
    print("  BGE-M3 auto-hospedado      US$ 0 de API (custa a máquina que serve o modelo)")
    por_fonte: dict[str, int] = {}
    for c in chunks:
        por_fonte[c["fonte"]] = por_fonte.get(c["fonte"], 0) + 1
    print("\nchunks por fonte:")
    for fonte, n in sorted(por_fonte.items(), key=lambda x: -x[1]):
        print(f"  {fonte:<14} {n:>5}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fonte", action="append", help="limita a uma ou mais fontes")
    ap.add_argument("--estimativa", action="store_true", help="só calcula tokens e custo")
    args = ap.parse_args()

    if not CHUNKS.exists():
        print("erro: rode `python3 extrair.py && python3 chunk.py` primeiro.", file=sys.stderr)
        return 1
    chunks = [json.loads(l) for l in CHUNKS.read_text().splitlines() if l.strip()]
    if args.fonte:
        chunks = [c for c in chunks if c["fonte"] in args.fonte]
        if not chunks:
            print(f"erro: nenhum chunk das fontes {args.fonte}", file=sys.stderr)
            return 1

    if args.estimativa:
        estimar(chunks)
        return 0

    enviados = 0
    pendentes: list[dict] = []
    for inicio in range(0, len(chunks), LOTE_EMBED):
        lote = chunks[inicio:inicio + LOTE_EMBED]
        vetores = embeddings([c["texto_embed"] for c in lote])
        if len(vetores) != len(lote):
            raise RuntimeError(f"provedor devolveu {len(vetores)} vetores para {len(lote)} textos")
        pendentes.extend(para_linha(c, v) for c, v in zip(lote, vetores))
        while len(pendentes) >= LOTE_UPSERT:
            upsert(pendentes[:LOTE_UPSERT])
            pendentes = pendentes[LOTE_UPSERT:]
            enviados += LOTE_UPSERT
            print(f"  {enviados}/{len(chunks)}", flush=True)
    if pendentes:
        upsert(pendentes)
        enviados += len(pendentes)
    print(f"{enviados} chunks indexados.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
