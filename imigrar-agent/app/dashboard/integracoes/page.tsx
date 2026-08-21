"use client";

import { useEffect, useState } from "react";
import { Card, PageHeader, SectionTitle, Icon, btnPrimary } from "@/components/dashboard/ui";

type ConfigData = {
  instanceId: string;
  baseUrl: string;
  tokenSet: boolean;
  clientTokenSet: boolean;
};

type StatusData = {
  connected: boolean;
  configured: boolean;
  detail?: string;
};

type Feedback = { kind: "success" | "error"; text: string } | null;

const DEFAULT_BASE_URL = "https://api.z-api.io";

const inputClass =
  "w-full rounded-xl border border-ib-line bg-white px-3 py-2.5 text-sm text-ib-ink placeholder:text-ib-slate focus:border-ib-mar focus:outline-none focus:ring-2 focus:ring-ib-mar/20";

function FeedbackNote({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  const ok = feedback.kind === "success";
  return (
    <p
      className={`mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
        ok
          ? "border border-ib-success/25 bg-ib-success/8 text-[#15803D]"
          : "border border-ib-danger/20 bg-ib-danger/5 text-ib-danger"
      }`}
    >
      <Icon name={ok ? "check" : "bolt"} className="h-3.5 w-3.5" />
      {feedback.text}
    </p>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-ib-slate">
          {label}
        </label>
        {hint ? <span className="text-[11px] text-ib-slate">{hint}</span> : null}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export default function IntegracoesPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [config, setConfig] = useState<ConfigData | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [testing, setTesting] = useState(false);

  const [instanceId, setInstanceId] = useState("");
  const [token, setToken] = useState("");
  const [clientToken, setClientToken] = useState("");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Status da IA (DeepSeek): conexão + saldo.
  const [ai, setAi] = useState<{
    configured: boolean;
    connected: boolean;
    model?: string;
    balance?: { currency: string; total: string; granted: string; toppedUp: string } | null;
    detail?: string;
  } | null>(null);
  const [aiLoading, setAiLoading] = useState(true);

  async function loadAi() {
    setAiLoading(true);
    try {
      const res = await fetch("/api/integrations/deepseek", { cache: "no-store" });
      setAi((await res.json()) as typeof ai);
    } catch {
      setAi({ configured: false, connected: false, detail: "Falha ao consultar a IA." });
    } finally {
      setAiLoading(false);
    }
  }

  useEffect(() => {
    loadAi();
  }, []);

  // Brevo (envio de e-mail das propostas).
  const [brevo, setBrevo] = useState<{ senderEmail: string; senderName: string; apiKeySet: boolean; configured: boolean } | null>(null);
  const [brevoApiKey, setBrevoApiKey] = useState("");
  const [brevoSenderEmail, setBrevoSenderEmail] = useState("");
  const [brevoSenderName, setBrevoSenderName] = useState("Imigrar Brasil");
  const [brevoSaving, setBrevoSaving] = useState(false);
  const [brevoFeedback, setBrevoFeedback] = useState<Feedback>(null);

  async function loadBrevo() {
    try {
      const res = await fetch("/api/integrations/brevo", { cache: "no-store" });
      const d = (await res.json()) as { config: { senderEmail: string; senderName: string; apiKeySet: boolean; configured: boolean } };
      setBrevo(d.config);
      setBrevoSenderEmail(d.config.senderEmail || "");
      setBrevoSenderName(d.config.senderName || "Imigrar Brasil");
    } catch {
      /* silencioso */
    }
  }
  useEffect(() => {
    loadBrevo();
  }, []);

  async function saveBrevo() {
    setBrevoFeedback(null);
    if (!brevoSenderEmail.trim()) {
      setBrevoFeedback({ kind: "error", text: "Informe o e-mail remetente." });
      return;
    }
    setBrevoSaving(true);
    try {
      const res = await fetch("/api/integrations/brevo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: brevoApiKey.trim() ? brevoApiKey.trim() : undefined,
          senderEmail: brevoSenderEmail.trim(),
          senderName: brevoSenderName.trim() || "Imigrar Brasil",
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setBrevoFeedback({ kind: "success", text: "Brevo salvo." });
      setBrevoApiKey("");
      await loadBrevo();
    } catch (err) {
      setBrevoFeedback({ kind: "error", text: err instanceof Error ? err.message : "Erro ao salvar" });
    } finally {
      setBrevoSaving(false);
    }
  }

  async function loadConfig() {
    const res = await fetch("/api/integrations/zapi", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { config: ConfigData };
    setConfig(data.config);
    setInstanceId(data.config.instanceId ?? "");
    setBaseUrl(data.config.baseUrl || DEFAULT_BASE_URL);
  }

  async function testConnection() {
    setTesting(true);
    try {
      const res = await fetch("/api/integrations/zapi/status", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as StatusData;
      setStatus(data);
    } catch {
      setStatus({ connected: false, configured: Boolean(config?.tokenSet), detail: "Não foi possível consultar o status." });
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await loadConfig();
      } catch (err) {
        if (active) setLoadError(err instanceof Error ? err.message : "Erro ao carregar");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) testConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function saveConfig() {
    setFeedback(null);
    if (!instanceId.trim()) {
      setFeedback({ kind: "error", text: "Informe o Instance ID." });
      return;
    }
    if (!token.trim()) {
      setFeedback({ kind: "error", text: "Informe o Token (necessário sempre que salvar)." });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/zapi", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId: instanceId.trim(),
          token: token.trim(),
          clientToken: clientToken.trim() ? clientToken.trim() : undefined,
          baseUrl: baseUrl.trim() || DEFAULT_BASE_URL,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setFeedback({ kind: "success", text: "Integração salva." });
      setToken("");
      setClientToken("");
      await loadConfig();
      await testConnection();
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  }

  const indicator = !status || !status.configured
    ? { label: "Não configurado", dot: "bg-slate-400", ring: "ring-slate-200", bg: "bg-slate-50", text: "text-ib-slate" }
    : status.connected
      ? { label: "Conectado", dot: "bg-ib-success", ring: "ring-ib-success/20", bg: "bg-ib-success/8", text: "text-[#15803D]" }
      : { label: "Desconectado", dot: "bg-ib-danger", ring: "ring-ib-danger/15", bg: "bg-ib-danger/5", text: "text-ib-danger" };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Agente" title="Integrações" />
        <Card className="p-6">
          <p className="text-sm text-ib-slate">Carregando…</p>
        </Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Agente" title="Integrações" />
        <div className="rounded-xl border border-ib-danger/20 bg-ib-danger/5 px-4 py-3 text-sm text-ib-danger">
          Não foi possível carregar a integração: {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agente"
        title="Integrações"
        description="Conecte o WhatsApp via Z-API para que o agente atenda no número real da Imigrar Brasil."
      />

      {/* IA — DeepSeek (status + saldo) */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                ai?.connected ? "bg-ib-success/8 ring-ib-success/20" : "bg-slate-50 ring-slate-200"
              } ring-4`}
            >
              <Icon name="bolt" className={`h-5 w-5 ${ai?.connected ? "text-[#15803D]" : "text-ib-slate"}`} />
            </span>
            <div>
              <p className={`text-base font-semibold ${ai?.connected ? "text-[#15803D]" : "text-ib-slate"}`}>
                Inteligência (DeepSeek) — {aiLoading ? "verificando…" : ai?.connected ? "Conectada" : "Desconectada"}
              </p>
              <p className="mt-0.5 text-sm text-ib-slate">
                {aiLoading ? "Consultando a IA…" : ai?.detail ?? "IA não configurada."}
                {ai?.model ? ` · modelo ${ai.model}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ib-slate">Saldo</p>
              <p className="text-xl font-semibold tabular-nums text-ib-ink">
                {ai?.balance ? `${ai.balance.currency === "USD" ? "US$" : ai.balance.currency} ${ai.balance.total}` : "—"}
              </p>
            </div>
            <button type="button" onClick={loadAi} disabled={aiLoading} className={btnPrimary}>
              <Icon name="pulse" className="h-4 w-4" />
              {aiLoading ? "…" : "Atualizar"}
            </button>
          </div>
        </div>
      </Card>

      {/* Brevo — e-mail das propostas */}
      <Card>
        <SectionTitle>
          E-mail (Brevo){" "}
          {brevo?.configured ? (
            <span className="ml-2 rounded-full bg-ib-success/8 px-2 py-0.5 text-[11px] font-medium text-[#15803D]">conectado</span>
          ) : (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-ib-slate">não configurado</span>
          )}
        </SectionTitle>
        <div className="space-y-4 p-5 sm:p-6">
          <p className="text-sm text-ib-slate">
            Conecte sua conta Brevo para o agente e a equipe enviarem as propostas por e-mail (com o PDF em anexo), direto da tela de Propostas.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="API Key (Brevo)" hint={brevo?.apiKeySet ? "definida" : "não definida"}>
              <input
                type="password"
                value={brevoApiKey}
                onChange={(e) => setBrevoApiKey(e.target.value)}
                placeholder={brevo?.apiKeySet ? "•••••••• (digite para substituir)" : "xkeysib-..."}
                className={inputClass}
                autoComplete="off"
              />
            </Field>
            <Field label="E-mail remetente">
              <input
                type="email"
                value={brevoSenderEmail}
                onChange={(e) => setBrevoSenderEmail(e.target.value)}
                placeholder="comercial@shinerio.com"
                className={inputClass}
              />
            </Field>
            <Field label="Nome do remetente">
              <input
                value={brevoSenderName}
                onChange={(e) => setBrevoSenderName(e.target.value)}
                placeholder="Imigrar Brasil"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-ib-line pt-4">
            <button type="button" onClick={saveBrevo} disabled={brevoSaving} className={btnPrimary}>
              <Icon name="check" className="h-4 w-4" />
              {brevoSaving ? "Salvando…" : "Salvar"}
            </button>
            <p className="text-xs text-ib-slate">
              A API Key fica salva no servidor e nunca é reenviada ao navegador — digite de novo para trocar.
            </p>
          </div>
          <FeedbackNote feedback={brevoFeedback} />
        </div>
      </Card>

      {/* Status card */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${indicator.bg} ring-4 ${indicator.ring}`}>
              <span className={`h-3.5 w-3.5 rounded-full ${indicator.dot}`} />
            </span>
            <div>
              <p className={`text-base font-semibold ${indicator.text}`}>{indicator.label}</p>
              <p className="mt-0.5 text-sm text-ib-slate">
                {status?.detail ?? "Ainda não testado."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={testConnection}
            disabled={testing}
            className={btnPrimary}
          >
            <Icon name="pulse" className="h-4 w-4" />
            {testing ? "Testando…" : "Testar conexão"}
          </button>
        </div>
      </Card>

      {/* Config card */}
      <Card>
        <SectionTitle>Credenciais Z-API</SectionTitle>
        <div className="space-y-4 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Instance ID">
              <input
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
                placeholder="Ex.: 3C1A2B..."
                className={inputClass}
              />
            </Field>
            <Field label="Base URL">
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={DEFAULT_BASE_URL}
                className={inputClass}
              />
            </Field>
            <Field label="Token" hint={config?.tokenSet ? "definido" : "não definido"}>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={config?.tokenSet ? "•••••••• (digite para substituir)" : "Cole o token da instância"}
                className={inputClass}
                autoComplete="off"
              />
            </Field>
            <Field
              label="Client-Token (Security Token)"
              hint={config?.clientTokenSet ? "definido" : "opcional · não definido"}
            >
              <input
                type="password"
                value={clientToken}
                onChange={(e) => setClientToken(e.target.value)}
                placeholder={config?.clientTokenSet ? "•••••••• (digite para substituir)" : "Se sua conta exigir"}
                className={inputClass}
                autoComplete="off"
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-ib-line pt-4">
            <button type="button" onClick={saveConfig} disabled={saving} className={btnPrimary}>
              <Icon name="check" className="h-4 w-4" />
              {saving ? "Salvando…" : "Salvar"}
            </button>
            <p className="text-xs text-ib-slate">
              Por segurança, o token e o client-token nunca são reenviados ao navegador — para
              atualizá-los, digite o valor novamente.
            </p>
          </div>
          <FeedbackNote feedback={feedback} />
        </div>
      </Card>

      {/* Help block */}
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ib-bruma text-ib-mar">
            <Icon name="plug" className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ib-ink">Como conectar</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-sm leading-relaxed text-ib-slate">
              <li>
                Crie uma instância no painel da{" "}
                <span className="font-medium text-ib-ink">Z-API</span> (z-api.io) — cada
                número de WhatsApp tem sua própria instância.
              </li>
              <li>
                No app da Z-API, conecte seu WhatsApp lendo o QR Code exibido no painel da
                instância.
              </li>
              <li>
                Copie o <span className="font-medium text-ib-ink">Instance ID</span> e o{" "}
                <span className="font-medium text-ib-ink">Token</span> da instância e cole nos
                campos acima.
              </li>
              <li>
                Se sua conta Z-API exigir, informe também o{" "}
                <span className="font-medium text-ib-ink">Client-Token</span> (Account Security
                Token), disponível em Segurança no painel da Z-API.
              </li>
              <li>
                Salve e use o botão <span className="font-medium text-ib-ink">Testar conexão</span>{" "}
                para confirmar que o WhatsApp está conectado.
              </li>
            </ol>
          </div>
        </div>
      </Card>
    </div>
  );
}
