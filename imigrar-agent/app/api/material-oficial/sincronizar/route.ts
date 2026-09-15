import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { listarAcervo } from "@/lib/agent/acervo";
import { origemDosArquivos, sincronizarComStorage } from "@/lib/agent/acervo-arquivos";
import { useSupabase } from "@/lib/env";

export const dynamic = "force-dynamic";

// Sete PDFs, ~21 MB no total, um upload por vez. Não é rápido e não precisa ser — roda uma
// vez na vida do projeto, e de novo só quando entrar documento novo pelo repositório.
export const maxDuration = 300;

/**
 * LEVAR PARA O SUPABASE O QUE AINDA SÓ EXISTE NO REPOSITÓRIO.
 *
 * Os sete documentos originais viajam dentro do deploy. Isso funciona para download, mas
 * deixa o acervo em dois lugares com naturezas diferentes: o que a equipe sobe vive no
 * Supabase e muda; os sete vivem no commit e só mudam com deploy. Depois desta
 * sincronização o acervo inteiro tem um lugar só, e o repositório vira o que deve ser — a
 * semente e a rede de segurança.
 *
 * É idempotente: o que já está no storage não é reenviado. Reenviar sobrescreveria com a
 * cópia congelada do commit uma versão que alguém pode ter subido pelo painel — que é
 * exatamente o estrago que uma sincronização "para garantir" costuma causar.
 */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  if (!useSupabase) {
    return NextResponse.json(
      {
        error:
          "O Supabase não está configurado neste ambiente. Sem ele não há para onde enviar os arquivos.",
      },
      { status: 503 },
    );
  }

  const { documentos } = await listarAcervo();
  const resultado = await sincronizarComStorage(documentos.map((d) => d.arquivo));
  const arquivos = await origemDosArquivos(documentos.map((d) => d.arquivo));

  return NextResponse.json({
    ok: resultado.falhas.length === 0,
    ...resultado,
    arquivos,
    error: resultado.falhas.length
      ? `Não consegui enviar ${resultado.falhas.length} arquivo(s): ${resultado.falhas
          .map((f) => `${f.arquivo} (${f.erro})`)
          .join("; ")}`
      : undefined,
  });
}
