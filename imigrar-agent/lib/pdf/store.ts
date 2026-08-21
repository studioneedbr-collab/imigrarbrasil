import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Salva o PDF em disco (best-effort, conveniência de dev/local). Em serverless o
// /tmp é efêmero, mas a proposta também fica no repositório (data-URL) e é servida
// por GET /api/proposal/[id]. Retorna o caminho salvo ou null se falhar.
export async function savePdfToTmp(id: string, buffer: Buffer): Promise<string | null> {
  try {
    const dir = path.join(os.tmpdir(), "imigrar-propostas");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${id}.pdf`);
    await writeFile(file, buffer);
    return file;
  } catch {
    return null;
  }
}
