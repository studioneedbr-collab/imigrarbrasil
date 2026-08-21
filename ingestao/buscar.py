#!/usr/bin/env python3
"""Etapa 4 — teste de recuperação vetorial contra o Supabase.

Uso:
  python3 buscar.py                       # roda a bateria de perguntas.json
  python3 buscar.py "¿cómo pido refugio?" # uma consulta avulsa
  python3 buscar.py --colecao cartilha "..."

Mesmas variáveis de ambiente do embed_upsert.py.
"""
import argparse, json, os, sys, urllib.request
from pathlib import Path

from embed_upsert import _exigir, _post, embeddings

RAIZ = Path(__file__).resolve().parent
PERGUNTAS = RAIZ / "perguntas.json"


def buscar(consulta: str, colecoes: list[str], limite: int) -> list[dict]:
    vetor = embeddings([consulta])[0]
    base = _exigir("SUPABASE_URL").rstrip("/")
    chave = _exigir("SUPABASE_SERVICE_ROLE_KEY")
    return _post(
        f"{base}/rest/v1/rpc/buscar_chunks",
        {"consulta_embedding": vetor, "consulta_texto": consulta,
         "colecoes": colecoes, "limite": limite},
        {"apikey": chave, "Authorization": f"Bearer {chave}", "Content-Type": "application/json"},
    )


def mostrar(resultados: list[dict], detalhe: bool) -> None:
    for r in resultados:
        alerta = "  ⚠ material desatualizado" if r.get("alerta_desatualizacao") else ""
        citacao = f'{r["documento"]}, p. {r["pagina_inicio"]}'
        if r.get("artigo"):
            citacao = f'{r.get("diploma") or r["documento"]}, art. {r["artigo"]}'
        print(f'  {r["escore"]:.4f} [{r["colecao"]:<10}] {r["titulo"][:64]}')
        print(f'         fonte: {citacao} | atualizado: {r.get("atualizado_em")}{alerta}')
        if detalhe:
            print(f'         {r["texto"][:220]}...')


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("consulta", nargs="*")
    ap.add_argument("--colecao", action="append",
                    help="cartilha | legislacao | doutrina (padrão: só cartilha, como em produção)")
    ap.add_argument("--limite", type=int, default=5)
    ap.add_argument("--detalhe", action="store_true", help="imprime trecho do texto")
    args = ap.parse_args()

    colecoes = args.colecao or ["cartilha"]

    if args.consulta:
        mostrar(buscar(" ".join(args.consulta), colecoes, args.limite), True)
        return 0

    casos = json.loads(PERGUNTAS.read_text())
    acertos = 0
    for caso in casos:
        resultados = buscar(caso["pergunta"], colecoes, args.limite)
        fontes = {r["fonte"] for r in resultados}
        esperadas = set(caso.get("espera_fonte", []))
        ok = bool(esperadas & fontes) if esperadas else True
        acertos += ok
        print(f'[{"ok" if ok else "!!"}] ({caso["idioma"]}) {caso["pergunta"]}')
        mostrar(resultados, args.detalhe)
        if not ok:
            print(f'       esperava alguma de {sorted(esperadas)}, veio {sorted(fontes)}')
        print()
    print(f"{acertos}/{len(casos)} consultas recuperaram a fonte esperada "
          f"(coleções: {', '.join(colecoes)})")
    return 0 if acertos == len(casos) else 1


if __name__ == "__main__":
    raise SystemExit(main())
