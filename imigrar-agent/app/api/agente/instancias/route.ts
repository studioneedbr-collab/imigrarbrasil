import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireAdmin, requireSession } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { ACAO_INSTANCIA_CRIADA } from "@/lib/agent/estado";
import { normalizeBaseUrl, conexaoDaInstancia } from "@/lib/whatsapp/config";
import type { ZapiInstancia } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/**
 * A instância como ela desce para o navegador: SEM o token.
 *
 * O token da Z-API dá poder de enviar mensagem pelo WhatsApp da empresa. Ele sobe no
 * formulário e nunca mais volta — a tela mostra "configurado" e um campo em branco para
 * substituir, do mesmo jeito que a tela de integrações já fazia.
 */
function paraOPainel(i: ZapiInstancia, conectada: boolean | null, ultimaMensagem: string | null = null) {
  return {
    id: i.id,
    nome: i.nome,
    ambiente: i.ambiente,
    instanceId: i.instanceId,
    tokenSet: Boolean(i.token),
    clientTokenSet: Boolean(i.clientToken),
    baseUrl: i.baseUrl,
    ativo: i.ativo,
    ativadoPor: i.ativadoPor,
    ativadoEm: i.ativadoEm,
    modoDesligado: i.modoDesligado,
    respostaFixa: i.respostaFixa,
    slaMinutos: i.slaMinutos,
    conectada,
    // "Conectada" e "está chegando mensagem" são coisas diferentes: a instância pode
    // estar conectada e o número, morto. Quem opera precisa das duas.
    ultimaMensagem,
    criadoEm: i.criadoEm,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const instancias = await getRepository().listInstancias();

  // A conexão real de cada instância custa uma ida à Z-API. Só é conferida quando a tela
  // pede (`?conexao=1`): a lista aparece em lugares onde ninguém quer esperar rede.
  const querConexao = req.nextUrl.searchParams.get("conexao") === "1";
  const [conexoes, ultimas] = await Promise.all([
    querConexao
      ? Promise.all(instancias.map((i) => conexaoDaInstancia(i).catch(() => false)))
      : Promise.resolve(instancias.map(() => null)),
    getRepository().ultimaMensagemPorInstancia().catch(() => ({}) as Record<string, string>),
  ]);

  return NextResponse.json({
    instancias: instancias.map((i, n) => paraOPainel(i, conexoes[n], ultimas[i.id] ?? null)),
  });
}

const criarSchema = z.object({
  nome: z.string().min(1, "Dê um nome a esta instância.").max(80),
  instanceId: z.string().min(1, "Informe o Instance ID."),
  token: z.string().min(1, "Informe o Token."),
  clientToken: z.string().optional(),
  baseUrl: z.string().optional(),
});

/**
 * CADASTRAR UMA INSTÂNCIA.
 *
 * Repare no que o schema NÃO aceita: `ambiente` e `ativo`. Não é esquecimento — é a
 * regra. Instância nova nasce em teste e desligada, e nem um payload malicioso nem um
 * formulário mal montado mudam isso: o repositório não lê esses campos e o banco tem um
 * trigger que os reescreve. Promover a produção e ativar são dois gestos deliberados
 * depois, cada um com o seu registro de auditoria.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let input: z.infer<typeof criarSchema>;
  try {
    input = criarSchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "Payload inválido.";
    return NextResponse.json({ error: msg ?? "Payload inválido." }, { status: 400 });
  }

  try {
    const inst = await getRepository().criarInstancia({
      nome: input.nome.trim(),
      instanceId: input.instanceId.trim(),
      token: input.token.trim(),
      clientToken: input.clientToken?.trim() || null,
      baseUrl: normalizeBaseUrl(input.baseUrl),
    });

    await registrarAcesso(
      auth.session,
      ACAO_INSTANCIA_CRIADA,
      { tipo: "instancia", id: inst.id, detalhe: `${inst.nome} · nasceu em teste e desligada` },
      req,
    );

    return NextResponse.json({ ok: true, instancia: paraOPainel(inst, null) });
  } catch (err) {
    const bruto = err instanceof Error ? err.message : "";
    console.error("[agente/instancias:POST]", bruto);
    const msg = /duplicate|unique/i.test(bruto)
      ? "Já existe uma instância cadastrada com esse Instance ID."
      : "Falha ao cadastrar a instância.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
