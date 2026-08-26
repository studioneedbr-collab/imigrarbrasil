import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { getZapiConfig, normalizeBaseUrl } from "@/lib/whatsapp/config";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const DEFAULT_BASE_URL = "https://api.z-api.io";

type ZapiConfig = {
  instanceId: string;
  token: string;
  clientToken?: string;
  baseUrl?: string;
};

const putSchema = z.object({
  instanceId: z.string().min(1, "Informe o Instance ID."),
  token: z.string().min(1, "Informe o Token."),
  clientToken: z.string().optional(),
  baseUrl: z.string().min(1).optional().default(DEFAULT_BASE_URL),
});

export async function GET() {
  // Config efetiva: o que vale de fato para o envio (painel/banco com ENV de fallback).
  const config = await getZapiConfig();

  return NextResponse.json({
    config: {
      instanceId: config.instanceId ?? "",
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      tokenSet: Boolean(config.token),
      clientTokenSet: Boolean(config.clientToken),
    },
    // O webhook é o caminho de ENTRADA: sem ele a Ana não recebe mensagem nenhuma, e
    // o painel fica com cara de agente mudo. Aqui vai só se o segredo existe — o valor
    // em si não desce para o navegador.
    webhook: {
      tokenSet: Boolean(process.env.WEBHOOK_VERIFY_TOKEN),
      caminho: "/api/webhook/whatsapp",
    },
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const parsed = putSchema.parse(body);
    const repo = getRepository();

    const value: ZapiConfig = {
      instanceId: parsed.instanceId,
      token: parsed.token,
      // Só a origem (ignora se colaram a URL completa do endpoint no campo Base URL).
      baseUrl: normalizeBaseUrl(parsed.baseUrl),
      ...(parsed.clientToken ? { clientToken: parsed.clientToken } : {}),
    };

    await repo.setConfig("zapi", value);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao salvar integração.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
