"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, btnPrimary } from "@/components/dashboard/ui";
import { rotulo, campo } from "./form-post";
import type { ConfigSite } from "@/lib/site/conteudo";

const VAZIA: ConfigSite = {
  telefone: "", whatsapp: "", email: "",
  endereco: { rua: "", bairro: "", cidade: "", uf: "", cep: "" },
  social: { instagram: "", linkedin: "", facebook: "", x: "", youtube: "", tiktok: "" },
  numeros: [],
  ctas: { heroPrincipal: "", heroSecundario: "", chamadaTitulo: "", chamadaTexto: "", botaoWhatsapp: "", mensagemWhatsapp: "" },
  ebookCheckout: "",
};

const REDES: [keyof ConfigSite["social"], string][] = [
  ["instagram", "Instagram"], ["linkedin", "LinkedIn"], ["facebook", "Facebook"], ["x", "X (Twitter)"], ["youtube", "YouTube"], ["tiktok", "TikTok"],
];
const CTAS: [keyof ConfigSite["ctas"], string, string][] = [
  ["heroPrincipal", "Botão principal do topo da home", "Nossos serviços"],
  ["heroSecundario", "Botão de contato (topo e cabeçalho)", "Fale com a gente"],
  ["chamadaTitulo", "Título da faixa de chamada (fim das páginas)", "Vamos olhar o seu caso?"],
  ["chamadaTexto", "Texto da faixa de chamada", ""],
  ["botaoWhatsapp", "Botão de WhatsApp da faixa", "Falar no WhatsApp"],
  ["mensagemWhatsapp", "Mensagem que já vem escrita no WhatsApp", ""],
];

function Secao({ titulo, children, nota }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="font-display text-base font-semibold text-ib-ink">{titulo}</h2>
      {nota ? <p className="mt-1 text-sm text-ib-slate">{nota}</p> : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

export default function FormConfig({ inicial, podeEditar }: { inicial: ConfigSite | null; podeEditar: boolean }) {
  const router = useRouter();
  const [c, setC] = useState<ConfigSite>(inicial ?? VAZIA);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const sub = <K extends "endereco" | "social" | "ctas">(k: K, campoK: keyof ConfigSite[K], v: string) =>
    setC((x) => ({ ...x, [k]: { ...x[k], [campoK]: v } }));

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    const r = await fetch("/api/site/conteudo/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dados: { ...c, numeros: c.numeros.filter((n) => n.valor.trim()) }, publicado: true }),
    });
    const d = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) return setMsg({ tipo: "erro", texto: d.error ?? "Não foi possível salvar." });
    setMsg({ tipo: "ok", texto: "Salvo. Clique em Publicar na Visão geral para levar ao site." });
    router.refresh();
  }

  if (!inicial && !podeEditar) return <p className="text-sm text-ib-slate">As configurações ainda não foram importadas.</p>;

  return (
    <fieldset disabled={!podeEditar} className="flex flex-col gap-5">
      {!inicial ? <p className="rounded-xl bg-ib-warn/10 px-4 py-3 text-sm text-[#8a5308]">As configurações do site ainda não foram importadas. Importe na Visão geral para começar com os valores atuais.</p> : null}

      <Secao titulo="Contato">
        <label className={rotulo}>Telefone (como aparece)<input className={campo} value={c.telefone} onChange={(e) => setC({ ...c, telefone: e.target.value })} placeholder="+55 (11) 91985-4664" /></label>
        <label className={rotulo}>WhatsApp (só dígitos, com DDI)<input className={campo} value={c.whatsapp} inputMode="numeric" onChange={(e) => setC({ ...c, whatsapp: e.target.value.replace(/\D/g, "") })} placeholder="5511919854664" /></label>
        <label className={rotulo}>E-mail<input className={campo} type="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /></label>
        <label className={rotulo}>Link de compra do e-book<input className={campo} value={c.ebookCheckout} onChange={(e) => setC({ ...c, ebookCheckout: e.target.value })} placeholder="https://pay.kiwify.com.br/…" /></label>
      </Secao>

      <Secao titulo="Endereço">
        <label className={rotulo}>Rua e número<input className={campo} value={c.endereco.rua} onChange={(e) => sub("endereco", "rua", e.target.value)} /></label>
        <label className={rotulo}>Bairro<input className={campo} value={c.endereco.bairro} onChange={(e) => sub("endereco", "bairro", e.target.value)} /></label>
        <label className={rotulo}>Cidade<input className={campo} value={c.endereco.cidade} onChange={(e) => sub("endereco", "cidade", e.target.value)} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className={rotulo}>UF<input className={campo} maxLength={2} value={c.endereco.uf} onChange={(e) => sub("endereco", "uf", e.target.value.toUpperCase())} /></label>
          <label className={rotulo}>CEP<input className={campo} value={c.endereco.cep} onChange={(e) => sub("endereco", "cep", e.target.value)} /></label>
        </div>
      </Secao>

      <Secao titulo="Redes sociais" nota="Deixe em branco a rede que não usar: ela some do rodapé do site.">
        {REDES.map(([k, nome]) => (
          <label key={k} className={rotulo}>{nome}<input className={campo} value={c.social[k]} onChange={(e) => sub("social", k, e.target.value)} placeholder="https://…" /></label>
        ))}
      </Secao>

      <Card className="p-5">
        <h2 className="font-display text-base font-semibold text-ib-ink">Números da home</h2>
        <p className="mt-1 text-sm text-ib-slate">Os três primeiros aparecem no topo; todos aparecem em Quem Somos.</p>
        <div className="mt-4 flex flex-col gap-2">
          {c.numeros.map((n, i) => (
            <div key={i} className="grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-2">
              <input className={campo + " mt-0 font-mono"} value={n.valor} onChange={(e) => setC({ ...c, numeros: c.numeros.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)) })} placeholder="352 mil" />
              <input className={campo + " mt-0"} value={n.rotulo} onChange={(e) => setC({ ...c, numeros: c.numeros.map((x, j) => (j === i ? { ...x, rotulo: e.target.value } : x)) })} placeholder="vidas impactadas" />
              <button type="button" className="text-xs font-semibold text-ib-danger" onClick={() => setC({ ...c, numeros: c.numeros.filter((_, j) => j !== i) })}>remover</button>
            </div>
          ))}
          {c.numeros.length < 6 ? <button type="button" className="w-fit text-sm font-semibold text-ib-mar hover:underline" onClick={() => setC({ ...c, numeros: [...c.numeros, { valor: "", rotulo: "" }] })}>+ número</button> : null}
        </div>
      </Card>

      <Secao titulo="Chamadas (CTAs)" nota="Os textos dos botões e da faixa de chamada que se repetem pelo site.">
        {CTAS.map(([k, nome, ex]) => (
          <label key={k} className={rotulo + (k === "chamadaTexto" || k === "mensagemWhatsapp" ? " sm:col-span-2" : "")}>{nome}
            {k === "chamadaTexto" || k === "mensagemWhatsapp"
              ? <textarea rows={2} className={campo} value={c.ctas[k]} onChange={(e) => sub("ctas", k, e.target.value)} />
              : <input className={campo} value={c.ctas[k]} onChange={(e) => sub("ctas", k, e.target.value)} placeholder={ex} />}
          </label>
        ))}
      </Secao>

      {msg ? <p role="status" className={`rounded-xl px-4 py-3 text-sm ${msg.tipo === "ok" ? "bg-ib-success/10 text-[#15803D]" : "bg-ib-danger/10 text-ib-danger"}`}>{msg.texto}</p> : null}
      {podeEditar ? <div><button type="button" className={btnPrimary} onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar configurações"}</button></div> : null}
    </fieldset>
  );
}
