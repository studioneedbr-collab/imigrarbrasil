#!/usr/bin/env python3
"""Etapa 2 — páginas -> chunks por seção temática.

Uso:  python3 chunk.py [id_da_fonte ...]     (sem argumento = todas)
Saída: out/chunks.jsonl

Três estratégias, escolhidas pelo campo `estrutura` em fontes.json:
  qa       cartilhas DPU: cada pergunta e sua resposta = 1 chunk
  artigos  legislação: cada `Art. N` = 1 chunk, com a hierarquia no metadado
  prosa    livro/cartilhas corridas: janela de parágrafos com sobreposição
Nunca cortamos no meio de um parágrafo — texto jurídico perde sentido.
"""
import hashlib, json, re, sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
ENTRADA = RAIZ / "out" / "paginas"
SAIDA = RAIZ / "out" / "chunks.jsonl"
POR_FONTE = RAIZ / "out" / "chunks"

ALVO = 1200        # caracteres desejados por chunk (~300 tokens em PT)
MAXIMO = 2200      # acima disso, quebramos mesmo dentro da seção
MINIMO = 180       # abaixo disso, o chunk é grudado no seguinte

# ------------------------------------------------------------- detectores
# A pergunta ora vem sozinha num parágrafo, ora colada na resposta ("...naturalização?1 As
# pessoas deverão..."). Casamos o prefixo interrogativo e devolvemos o resto como resposta.
_PERGUNTA = re.compile(r"^([A-ZÀ-Ý\"“(][^.!?]{4,180}\?)\s*\d{0,2}\s*(.*)$", re.S)
_ARTIGO = re.compile(r"^\s*(Art\.?\s*(\d+)[ºo°]?(?:-[A-Z])?)[\.\s]", re.I)
_HIERARQUIA = re.compile(r"^\s*(T[ÍI]TULO|CAP[ÍI]TULO|Subse[çc][ãa]o|Se[çc][ãa]o)\s+[IVXLC\d]", re.I)
_NIVEL = {"tit": 0, "cap": 1, "seç": 2, "sec": 2, "sub": 3}
_DIPLOMA = re.compile(
    r"^\s*(LEI|DECRETO|PORTARIA INTERMINISTERIAL|PORTARIA|RESOLU[ÇC][ÃA]O NORMATIVA|RESOLU[ÇC][ÃA]O)"
    r"[\s,]*(?:N[º°o]?\.?\s*)?([\d.]+)(?:[,\s]*DE\s+([^\n,]{4,40}))?", re.I)
# O extrator gruda "Seção II Do visto de visita" no "Art. 131." seguinte. Sem separar,
# a hierarquia entra no metadado carregando texto de artigo e depois congela desatualizada.
_LIMITE_LEGAL = re.compile(
    r"(?=\bArt\.\s*\d+[ºo°]?[\.\s])"
    r"|(?=\b(?:T[ÍI]TULO|CAP[ÍI]TULO|Se[çc][ãa]o|Subse[çc][ãa]o)\s+[IVXLC]+\b)")
_ATUALIZACAO = re.compile(r"[ÚU]ltima atualiza[çc][ãa]o\s*([A-Za-zç]+/\d{4})", re.I)


def _e_titulo(p: str) -> bool:
    """Parágrafo curto, sem ponto final e majoritariamente em caixa alta."""
    if len(p) > 90 or p.endswith((".", ";", ",", "?")):
        return False
    letras = [c for c in p if c.isalpha()]
    return len(letras) >= 4 and sum(1 for c in letras if c.isupper()) / len(letras) > 0.7


def _quebrar_longo(p: str):
    """Parágrafo acima do teto vira pedaços fechados em fim de frase."""
    if len(p) <= MAXIMO:
        return [p]
    pedacos, atual = [], ""
    for frase in re.split(r"(?<=[.;:!?])\s+", p):
        if atual and len(atual) + len(frase) > ALVO:
            pedacos.append(atual)
            atual = frase
        else:
            atual = f"{atual} {frase}".strip()
    if atual:
        pedacos.append(atual)
    return pedacos


def _paragrafos(doc: dict):
    """Fluxo (pagina, idioma, paragrafo) contínuo por documento."""
    for pagina in doc["paginas"]:
        for p in pagina["texto"].split("\n\n"):
            p = p.strip()
            if p:
                for pedaco in _quebrar_longo(p):
                    yield pagina["pagina"], pagina["idioma"], pedaco


# ------------------------------------------------------------ estratégias
def _divisoria(pagina: dict):
    """Nas cartilhas da DPU cada seção abre numa página com o carimbo de atualização.
    O que vem antes do carimbo é o nome da seção — é a fonte mais confiável que existe
    nesses PDFs, muito melhor que adivinhar título por caixa alta."""
    texto = pagina["texto"]
    marca = _ATUALIZACAO.search(texto)
    if not marca or len(texto) > 400:
        return None
    titulo = " ".join(texto[:marca.start()].split())
    return (titulo, marca.group(1)) if len(titulo) >= 4 else None


def _secao_manual(doc, numero_pagina):
    """Cartilhas cujas divisórias são imagem (visto) trazem o mapa em fontes.json."""
    mapa = doc.get("secoes_manuais")
    if not mapa:
        return None
    candidatas = [titulo for inicio, titulo in mapa if inicio <= numero_pagina]
    return candidatas[-1] if candidatas else None


def por_pergunta(doc):
    atual, secao, data_secao = None, None, None
    for pagina in doc["paginas"]:
        manual = _secao_manual(doc, pagina["pagina"])
        if manual and manual != secao:
            if atual:
                yield atual
                atual = None
            secao = manual
        divisoria = _divisoria(pagina)
        if divisoria:
            if atual:
                yield atual
                atual = None
            secao, data_secao = divisoria
            continue
        for pag, idioma, p in _paragrafos({"paginas": [pagina]}):
            for saida in _pergunta_paragrafo(doc, pag, idioma, p, secao, data_secao, atual):
                atual, pronto = saida
                if pronto:
                    yield pronto
    if atual:
        yield atual


def _pergunta_paragrafo(doc, pag, idioma, p, secao, data_secao, atual):
    """Devolve (chunk_corrente, chunk_finalizado_ou_None) — um passo do fluxo de perguntas."""
    if _e_titulo(p):
        yield atual, None
        return
    pronto = None
    pergunta = _PERGUNTA.match(p)
    if pergunta:
        pronto, atual = atual, _novo(doc, pag, idioma, titulo=pergunta.group(1), secao=secao)
        atual["atualizado_secao"] = data_secao
        p = pergunta.group(2).strip()
        if not p:
            yield atual, pronto
            return
    if atual is None:                          # texto antes da 1ª pergunta
        atual = _novo(doc, pag, idioma, titulo=secao or doc["titulo"], secao=secao)
        atual["atualizado_secao"] = data_secao
    if _estoura(atual, p):
        base = atual
        pronto = pronto or base
        atual = _novo(doc, pag, idioma, titulo=_cont(base["titulo"]), secao=secao)
        atual["atualizado_secao"] = data_secao
    _acrescentar(atual, pag, p)
    yield atual, pronto


def _separar_legal(paragrafo: str):
    for pedaco in _LIMITE_LEGAL.split(paragrafo):
        pedaco = pedaco.strip()
        if pedaco:
            yield pedaco


def por_artigo(doc):
    atual, hierarquia, diploma = None, {}, None
    fluxo = ((pag, idioma, pedaco)
             for pag, idioma, p in _paragrafos(doc)
             for pedaco in _separar_legal(p))
    for pag, idioma, p in fluxo:
        cabecalho = _DIPLOMA.match(p)
        if cabecalho and len(p) < 160:
            diploma = re.sub(r"\s+", " ", p).strip(" .")
            hierarquia = {}
            continue
        marcador = _HIERARQUIA.match(p)
        if marcador and len(p) < 160:
            nivel = _NIVEL[marcador.group(1).lower()[:3]]
            hierarquia = {k: v for k, v in hierarquia.items() if k < nivel}
            hierarquia[nivel] = p
            continue
        artigo = _ARTIGO.match(p)
        if artigo:
            if atual:
                yield atual
            atual = _novo(doc, pag, idioma,
                          titulo=f'{diploma or doc["titulo"]} — {artigo.group(1)}',
                          secao=_caminho(hierarquia))
            atual["diploma"] = diploma
            atual["artigo"] = artigo.group(2)
        if atual is None:
            atual = _novo(doc, pag, idioma, titulo=diploma or doc["titulo"],
                          secao=_caminho(hierarquia))
            atual["diploma"] = diploma
        if _estoura(atual, p):
            base = atual
            yield base
            atual = _novo(doc, pag, idioma, titulo=_cont(base["titulo"]), secao=base["secao"])
            atual["diploma"] = base.get("diploma")
            atual["artigo"] = base.get("artigo")
        _acrescentar(atual, pag, p)
    if atual:
        yield atual


def por_janela(doc):
    atual, secao, anterior = None, None, None
    for pag, idioma, p in _paragrafos(doc):
        if _e_titulo(p):
            if atual:
                yield atual
                atual = None
            secao = p.title()
            continue
        if atual is None:
            atual = _novo(doc, pag, idioma, titulo=secao or doc["titulo"], secao=secao)
            if anterior and len(anterior) < ALVO // 2:      # sobreposição de 1 parágrafo
                _acrescentar(atual, pag, anterior)
        if _estoura(atual, p):
            yield atual
            atual = _novo(doc, pag, idioma, titulo=_cont(secao or doc["titulo"]), secao=secao)
        _acrescentar(atual, pag, p)
        anterior = p
        if len(atual["texto"]) >= ALVO:
            yield atual
            atual = None
    if atual:
        yield atual


ESTRATEGIAS = {"qa": por_pergunta, "artigos": por_artigo, "prosa": por_janela}


# ------------------------------------------------------------- utilitários
def _novo(doc, pagina, idioma, titulo, secao):
    return {
        "fonte": doc["fonte"], "documento": doc["titulo"], "colecao": doc["colecao"],
        "orgao": doc["orgao"], "temas": doc["temas"], "idioma": idioma,
        "atualizado_em": doc["atualizado_em"],
        "alerta_desatualizacao": doc.get("alerta_desatualizacao"),
        "titulo": titulo, "secao": secao,
        "pagina_inicio": pagina, "pagina_fim": pagina, "texto": "",
    }


def _caminho(hierarquia: dict) -> str | None:
    return " > ".join(hierarquia[k] for k in sorted(hierarquia)) or None


def _estoura(chunk, paragrafo) -> bool:
    return bool(chunk["texto"]) and len(chunk["texto"]) + len(paragrafo) > MAXIMO


def _cont(titulo: str) -> str:
    return titulo if titulo.endswith("(cont.)") else f"{titulo} (cont.)"


def _acrescentar(chunk, pagina, paragrafo):
    chunk["texto"] = f'{chunk["texto"]}\n\n{paragrafo}'.strip()
    chunk["pagina_fim"] = max(chunk["pagina_fim"], pagina)


def _finalizar(chunks):
    """Gruda chunks curtos demais no seguinte, gera id estável e texto_embed."""
    juntados, pendente = [], None
    for c in chunks:
        if pendente:
            c["texto"] = f'{pendente["texto"]}\n\n{c["texto"]}'.strip()
            c["pagina_inicio"] = pendente["pagina_inicio"]
            pendente = None
        if len(c["texto"]) < MINIMO:
            pendente = c
            continue
        juntados.append(c)
    if pendente and juntados:
        juntados[-1]["texto"] += "\n\n" + pendente["texto"]
    elif pendente:
        juntados.append(pendente)

    for i, c in enumerate(juntados):
        c["ordem"] = i
        c["id"] = hashlib.sha1(
            f'{c["fonte"]}:{c["pagina_inicio"]}:{i}:{c["texto"][:120]}'.encode()
        ).hexdigest()[:16]
        # Prefixo de contexto: sem ele, um chunk como "Sim, desde que..." não recupera nada.
        contexto = " — ".join(x for x in (c["documento"], c["secao"], c["titulo"]) if x)
        c["texto_embed"] = f"{contexto}\n\n{c['texto']}"
        c["caracteres"] = len(c["texto"])
    return juntados


def main(argv):
    arquivos = sorted(ENTRADA.glob("*.json"))
    if argv:
        arquivos = [a for a in arquivos if a.stem in argv]
    if not arquivos:
        print("erro: rode `python3 extrair.py` primeiro.", file=sys.stderr)
        return 1

    POR_FONTE.mkdir(parents=True, exist_ok=True)
    for arquivo in arquivos:
        doc = json.loads(arquivo.read_text())
        chunks = _finalizar(list(ESTRATEGIAS[doc["estrutura"]](doc)))
        tamanhos = sorted(c["caracteres"] for c in chunks)
        mediana = tamanhos[len(tamanhos) // 2] if tamanhos else 0
        print(f'{doc["fonte"]:<14} {len(chunks):>5} chunks  '
              f'mediana {mediana:>5} car  max {tamanhos[-1] if tamanhos else 0:>5}  [{doc["estrutura"]}]')
        with (POR_FONTE / f'{doc["fonte"]}.jsonl').open("w") as f:
            for c in chunks:
                f.write(json.dumps(c, ensure_ascii=False) + "\n")

    total = 0
    with SAIDA.open("w") as consolidado:
        for parcial in sorted(POR_FONTE.glob("*.jsonl")):
            for linha in parcial.read_text().splitlines():
                consolidado.write(linha + "\n")
                total += 1
    print(f"\n{total} chunks -> {SAIDA.relative_to(RAIZ.parent)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
