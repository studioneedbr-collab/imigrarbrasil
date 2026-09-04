import type { Repository } from "@/lib/data/repository";
import type {
  Conversation, Message, MessageMedia, DocumentItem, Lead, Followup,
  FollowupStatus, Cliente, FlowStateId, TransferTicket, User,
  Classificacao, Reclassificacao, AccessLogEntry, EventoOperacao, TipoEventoOperacao, Lembrete,
  ZapiInstancia, RascunhoAgente, RascunhoStatus, ChamadaLlm, FunilCrm, EtapaCrm,
  ToqueDeFollowup,
} from "@/lib/domain/types";
import type { ModeloFollowup } from "@/lib/followup/modelos";
import { eFiltrada } from "@/lib/domain/types";
import { ambienteDaConversa } from "@/lib/domain/ambiente";
import { semCamposDePrazo, semCamposSoDeHumano } from "@/lib/data/prazo";
import type { ActivityMessage } from "@/lib/notifications/new-messages";
import { conversasSemResposta } from "@/lib/operacao/sem-resposta";
import { FUNIL_PADRAO, etapasPadrao } from "@/lib/crm/funil";
import {
  conversaParaReaproveitar,
  normalizarTelefone,
  variantesDoTelefone,
} from "@/lib/whatsapp/telefone";

let counter = 0;
const id = (p: string) => `${p}_${(++counter).toString(36)}_${Math.floor(performance.now())}`;
const now = () => new Date().toISOString();

export class MemoryRepository implements Repository {
  private conversations = new Map<string, Conversation>();
  private byNumber = new Map<string, string>();
  private messages = new Map<string, Message[]>();
  private leads = new Map<string, Lead>(); // key = conversationId
  private followups: Followup[] = [];
  private config = new Map<string, unknown>();
  private clientes = new Map<string, Cliente>();
  private tickets = new Map<string, TransferTicket>();
  private users = new Map<string, User>(); // key = lowercased email
  private reclassificacoes: Reclassificacao[] = [];
  private acessos: AccessLogEntry[] = [];
  private eventos: EventoOperacao[] = [];
  private lembretes: Lembrete[] = [];
  private instancias = new Map<string, ZapiInstancia>();
  private rascunhos: RascunhoAgente[] = [];
  private chamadas: ChamadaLlm[] = [];
  // O CRM começa com o funil padrão já montado — em memória vale o mesmo motivo do banco
  // (ver a migration 026): quadro sem coluna esconde todos os casos de uma vez.
  private funis: FunilCrm[] = [{ ...FUNIL_PADRAO }];
  private etapas: EtapaCrm[] = etapasPadrao();

  async getOrCreateConversation(whatsappNumber: string, contactName?: string): Promise<Conversation> {
    const existing = this.byNumber.get(whatsappNumber);
    if (existing) return this.conversations.get(existing)!;

    // MESMO TELEFONE, OUTRA GRAFIA. Ver lib/whatsapp/telefone.ts: "+55 95 99123-4567" e
    // "559591234567" são a mesma pessoa, e tratá-los como dois contatos foi o que fez
    // Ana Rodríguez aparecer duas vezes na fila, com metade da ficha em cada registro.
    const variantes = variantesDoTelefone(whatsappNumber);
    if (variantes.length) {
      const candidatas = Array.from(this.conversations.values())
        .filter((c) => variantes.includes(normalizarTelefone(c.whatsappNumber)))
        .map((c) => ({ id: c.id, status: c.status, atividadeEm: c.lastMessageAt ?? c.updatedAt }));
      const escolhida = conversaParaReaproveitar(candidatas);
      if (escolhida) {
        // O apelido novo aponta para a conversa antiga: a próxima mensagem com esta
        // mesma grafia cai direto, sem varrer nada.
        this.byNumber.set(whatsappNumber, escolhida.id);
        return this.conversations.get(escolhida.id)!;
      }
    }

    const conv: Conversation = {
      id: id("conv"), whatsappNumber, contactName: contactName ?? null,
      status: "active", leadScore: 0, createdAt: now(), updatedAt: now(),
      estadoAtual: "S0", lastMessageAt: now(), followupSentAt: null, reopenedAt: null,
      assumedBy: null, assumedAt: null,
      // `producao` por padrão: quem cria uma conversa por um caminho que não conhece
      // instância (simulador, teste, seed) está falando da operação real. Quem sabe que
      // é teste marca explicitamente — ver `registrarInstanciaDaConversa` no webhook.
      instanciaId: null, ambiente: "producao", aguardandoHumanoDesde: null,
    };
    this.conversations.set(conv.id, conv);
    this.byNumber.set(whatsappNumber, conv.id);
    this.messages.set(conv.id, []);
    return conv;
  }
  async getConversation(cid: string) { return this.conversations.get(cid) ?? null; }
  async updateConversation(cid: string, patch: Partial<Conversation>) {
    const c = this.conversations.get(cid);
    if (!c) throw new Error(`Conversation not found: ${cid}`);
    const updated = { ...c, ...patch, updatedAt: now() };
    this.conversations.set(cid, updated);
    return updated;
  }
  async listConversations() { return Array.from(this.conversations.values()); }
  async deleteConversation(id: string) {
    this.conversations.delete(id);
    this.messages.delete(id);
    this.leads.delete(id);
    for (const [k, t] of Array.from(this.tickets.entries())) {
      if (t.conversationId === id) this.tickets.delete(k);
    }
  }
  async updateConversationStatus(id: string, status: Conversation["status"]) {
    const c = this.conversations.get(id);
    if (c) this.conversations.set(id, { ...c, status, updatedAt: now() });
  }
  async updateLastMessageAt(id: string) {
    const c = this.conversations.get(id);
    if (c) this.conversations.set(id, { ...c, lastMessageAt: now() });
  }

  // Atendimento humano: só estes dois métodos mexem em assumedBy. Encaminhar para um
  // setor NÃO assume a conversa — a Ana segue atendendo até alguém entrar de fato.
  async assumeConversation(id: string, who: string) {
    const c = this.conversations.get(id);
    // Assumir fecha o relógio da primeira resposta humana: tem gente na conversa agora.
    if (c) this.conversations.set(id, { ...c, assumedBy: who, assumedAt: now(), status: "transferred", aguardandoHumanoDesde: null, updatedAt: now() });
  }
  async releaseConversation(id: string) {
    const c = this.conversations.get(id);
    if (c) this.conversations.set(id, { ...c, assumedBy: null, assumedAt: null, status: "active", updatedAt: now() });
  }
  async markFollowupSent(id: string) {
    const c = this.conversations.get(id);
    if (c) this.conversations.set(id, { ...c, followupSentAt: now() });
  }
  async getConversationsForFollowup() {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    return Array.from(this.conversations.values()).filter(
      (c) => c.status === "waiting" && !c.followupSentAt && !c.optOutAt && !c.noFollowupAt
        && new Date(c.lastMessageAt ?? c.updatedAt).getTime() < cutoff,
    );
  }
  async marcarOptOut(id: string, tipo: "bloquear" | "sem_followup", mensagem?: string) {
    const c = this.conversations.get(id);
    if (!c) return;
    const campo = tipo === "bloquear" ? "optOutAt" : "noFollowupAt";
    const campoMsg = tipo === "bloquear" ? "optOutMensagem" : "noFollowupMensagem";
    this.conversations.set(id, {
      ...c,
      [campo]: now(),
      ...(mensagem ? { [campoMsg]: mensagem.slice(0, 500) } : {}),
      updatedAt: now(),
    });
  }
  async getInactiveConversations() {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    return Array.from(this.conversations.values()).filter(
      (c) => c.status === "waiting" && !!c.followupSentAt && new Date(c.followupSentAt).getTime() < cutoff,
    );
  }

  async addMessage(conversationId: string, role: "user" | "assistant", content: string, whatsappMessageId?: string, media?: MessageMedia) {
    const msg: Message = {
      id: id("msg"), conversationId, role, content,
      whatsappMessageId: whatsappMessageId ?? null, createdAt: now(),
      mediaUrl: media?.url ?? null, mediaType: media?.kind ?? null,
      mediaName: media?.name ?? null, mediaText: media?.text ?? null,
    };
    if (!this.messages.has(conversationId)) this.messages.set(conversationId, []);
    this.messages.get(conversationId)!.push(msg);
    return msg;
  }
  async listMessages(conversationId: string) { return this.messages.get(conversationId) ?? []; }
  async listMessagesForConversations(conversationIds: string[]) {
    const out = new Map<string, Message[]>();
    for (const id of conversationIds) out.set(id, this.messages.get(id) ?? []);
    return out;
  }
  async setMessageMediaText(messageId: string, text: string) {
    for (const list of Array.from(this.messages.values())) {
      const m = list.find((x) => x.id === messageId);
      if (m) { m.mediaText = text; return; }
    }
  }
  async listDocuments(opts?: { conversationId?: string; limit?: number }): Promise<DocumentItem[]> {
    const out: DocumentItem[] = [];
    for (const [convId, list] of Array.from(this.messages.entries())) {
      if (opts?.conversationId && convId !== opts.conversationId) continue;
      const conv = this.conversations.get(convId);
      for (const m of list) {
        if (!m.mediaUrl) continue;
        out.push({
          messageId: m.id, conversationId: convId,
          contactName: conv?.contactName ?? null,
          whatsappNumber: conv?.whatsappNumber ?? "",
          url: m.mediaUrl, kind: m.mediaType ?? "document",
          name: m.mediaName ?? "documento", text: m.mediaText ?? null,
          createdAt: m.createdAt,
        });
      }
    }
    out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return out.slice(0, opts?.limit ?? 200);
  }
  async hasWhatsappMessage(whatsappMessageId: string): Promise<boolean> {
    for (const list of Array.from(this.messages.values())) {
      if (list.some((m) => m.whatsappMessageId === whatsappMessageId)) return true;
    }
    return false;
  }
  async listRecentUserMessages(limit: number): Promise<ActivityMessage[]> {
    const out: ActivityMessage[] = [];
    for (const list of Array.from(this.messages.values())) {
      for (const m of list) {
        if (m.role !== "user") continue;
        out.push({
          id: m.id,
          conversationId: m.conversationId,
          contactName: this.conversations.get(m.conversationId)?.contactName ?? null,
          createdAt: m.createdAt,
        });
      }
    }
    out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return out.slice(0, limit);
  }

  async upsertLead(conversationId: string, patch: Partial<Lead>) {
    const existing = this.leads.get(conversationId);
    const conv = this.conversations.get(conversationId);
    const defaults: Lead = {
      id: id("lead"), conversationId,
      whatsappNumber: conv?.whatsappNumber ?? "", status: "new",
      createdAt: now(), updatedAt: now(),
      stage: "novo", score: 0,
      temPrazoCorrendo: false, atendimentoStatus: "novo",
    };
    // Datas caem fora: este é o caminho do agente — prazo processual e o relógio do
    // caso, que também é de humano. Ver lib/data/prazo.ts.
    const limpo = semCamposSoDeHumano(semCamposDePrazo(patch));
    // A PRIMEIRA classificação da IA fica guardada à parte. É o denominador da taxa de
    // reclassificação — sobrescrevê-la a cada turno apagaria a discordância humana.
    const classificacaoIa =
      existing?.classificacaoIa ?? (limpo.classificacao as Classificacao | undefined) ?? null;
    const lead: Lead = { ...defaults, ...existing, ...limpo, classificacaoIa, updatedAt: now() };
    this.leads.set(conversationId, lead);
    return lead;
  }
  private salvar(lead: Lead): Lead {
    this.leads.set(lead.conversationId, lead);
    return lead;
  }
  private acharLead(id: string): Lead | null {
    for (const l of Array.from(this.leads.values())) if (l.id === id) return l;
    return null;
  }
  async getLead(id: string) { return this.acharLead(id); }
  async updateLead(id: string, patch: Partial<Lead>) {
    const atual = this.acharLead(id);
    if (!atual) throw new Error("Lead não encontrado.");
    // `classificacao` não passa por aqui: mudá-la é reclassificar, e reclassificar
    // registra o par (de → para). Ver `reclassificarLead`.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- descartada de propósito
    const { classificacao, ...resto } = semCamposDePrazo(patch);
    return this.salvar({ ...atual, ...resto, updatedAt: now() });
  }
  async confirmarPrazo(
    leadId: string,
    dados: { tipo: Lead["prazoTipo"]; notificacao?: string | null; limite?: string | null },
    autor: string,
  ) {
    const atual = this.acharLead(leadId);
    if (!atual) throw new Error("Lead não encontrado.");
    return this.salvar({
      ...atual,
      temPrazoCorrendo: true,
      prazoTipo: dados.tipo ?? atual.prazoTipo ?? null,
      prazoDataNotificacao: dados.notificacao ?? null,
      prazoDataLimite: dados.limite ?? null,
      prazoConfirmadoPor: autor,
      prazoConfirmadoEm: now(),
      updatedAt: now(),
    });
  }
  async assumirLead(leadId: string, usuarioId: string | null, autor: string) {
    const atual = this.acharLead(leadId);
    if (!atual) throw new Error("Lead não encontrado.");
    const salvo = this.salvar({
      ...atual,
      responsavelId: usuarioId,
      // Só o PRIMEIRO a assumir marca o relógio: o tempo até o primeiro contato humano
      // não pode ser reiniciado por uma troca de responsável no dia seguinte.
      assumidoEm: atual.assumidoEm ?? now(),
      atendimentoStatus: atual.atendimentoStatus === "novo" ? "em_atendimento" : atual.atendimentoStatus,
      updatedAt: now(),
    });
    await this.registrarAcesso({ autor, acao: "assumiu_lead", alvoTipo: "lead", alvoId: leadId });
    return salvo;
  }
  async reclassificarLead(leadId: string, para: Classificacao, autor: string, motivo?: string) {
    const atual = this.acharLead(leadId);
    if (!atual) throw new Error("Lead não encontrado.");
    const de = atual.classificacao ?? null;
    this.reclassificacoes.push({
      id: id("reclass"), leadId, de, para, motivo: motivo ?? null, autor, criadoEm: now(),
    });
    // Resgate = sair do descarte por mão humana. É a métrica que denuncia um agente
    // filtrando demais, então é marcada exatamente aqui, e não no clique do botão.
    const resgate = eFiltrada(de) && !eFiltrada(para);
    return this.salvar({
      ...atual,
      classificacao: para,
      resgatadoEm: resgate ? now() : atual.resgatadoEm,
      resgatadoPor: resgate ? autor : atual.resgatadoPor,
      updatedAt: now(),
    });
  }
  async listReclassificacoes() {
    return [...this.reclassificacoes].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }
  async registrarEventoOperacao(e: Omit<EventoOperacao, "id" | "criadoEm" | "contato">) {
    this.eventos.push({ ...e, id: id("evt"), criadoEm: now() });
  }
  async listEventosOperacao(opts: { tipo?: TipoEventoOperacao; desde?: string; apenasPendentes?: boolean; limit?: number } = {}) {
    let out = this.eventos.filter(
      (e) =>
        (!opts.tipo || e.tipo === opts.tipo) &&
        (!opts.desde || e.criadoEm >= opts.desde) &&
        (!opts.apenasPendentes || !e.resolvidoEm),
    );
    out = out.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    for (const e of out) {
      const conv = e.conversationId ? this.conversations.get(e.conversationId) : null;
      e.contato = conv ? { nome: conv.contactName, whatsappNumber: conv.whatsappNumber } : null;
    }
    return out.slice(0, opts.limit ?? 200);
  }
  async resolverEventoOperacao(eventoId: string, quem: string) {
    const e = this.eventos.find((x) => x.id === eventoId);
    if (e) { e.resolvidoEm = now(); e.resolvidoPor = quem; }
  }

  async ultimaMensagemPorInstancia() {
    const saida: Record<string, string> = {};
    for (const [conversationId, msgs] of Array.from(this.messages.entries())) {
      const conv = this.conversations.get(conversationId);
      if (!conv?.instanciaId) continue;
      for (const m of msgs) {
        if (m.role !== "user") continue;
        const atual = saida[conv.instanciaId];
        if (!atual || m.createdAt > atual) saida[conv.instanciaId] = m.createdAt;
      }
    }
    return saida;
  }

  async registrarChamadaLlm(c: Omit<ChamadaLlm, "id" | "criadoEm">) {
    this.chamadas.push({ ...c, id: id("llm"), criadoEm: now() });
  }
  async listChamadasLlm(opts: { desde?: string; provedor?: string; limit?: number } = {}) {
    return this.chamadas
      .filter((c) => (!opts.desde || c.criadoEm >= opts.desde) && (!opts.provedor || c.provedor === opts.provedor))
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
      .slice(0, opts.limit ?? 5000);
  }

  async contarConversasSemResposta(minutos: number, agora: Date = new Date()) {
    const todas: { conversationId: string; role: "user" | "assistant"; createdAt: string }[] = [];
    for (const [conversationId, msgs] of Array.from(this.messages.entries())) {
      for (const m of msgs) todas.push({ conversationId, role: m.role, createdAt: m.createdAt });
    }
    return conversasSemResposta(todas, { minutos, agora, ignorar: this.conversasComSilencioIntencional() }).length;
  }

  /** Onde a Ana calar é o comportamento certo: humano assumiu, ou o contato pediu para parar. */
  private conversasComSilencioIntencional(): Set<string> {
    const fora = new Set<string>();
    for (const c of Array.from(this.conversations.values())) {
      if (c.assumedBy || c.optOutAt) fora.add(c.id);
    }
    return fora;
  }

  async criarLembrete(l: { leadId: string; quando: string; nota: string; autor: string }) {
    const lembrete: Lembrete = { ...l, id: id("lemb"), criadoEm: now() };
    this.lembretes.push(lembrete);
    return lembrete;
  }
  async listLembretes(opts: { leadId?: string; apenasPendentes?: boolean } = {}) {
    return this.lembretes
      .filter((l) => (!opts.leadId || l.leadId === opts.leadId) && (!opts.apenasPendentes || !l.feitoEm))
      .sort((a, b) => a.quando.localeCompare(b.quando));
  }
  async concluirLembrete(lembreteId: string, quem: string) {
    const l = this.lembretes.find((x) => x.id === lembreteId);
    if (l) { l.feitoEm = now(); l.feitoPor = quem; }
  }

  // ─── CRM: FUNIS E ETAPAS ───

  async listFunis() {
    return [...this.funis].sort((a, b) => a.ordem - b.ordem || a.criadoEm.localeCompare(b.criadoEm));
  }
  async criarFunil(f: { nome: string; descricao?: string | null; padrao?: boolean }) {
    const funil: FunilCrm = {
      id: id("funil"),
      nome: f.nome,
      descricao: f.descricao ?? null,
      ordem: this.funis.length,
      padrao: !!f.padrao,
      arquivado: false,
      criadoEm: now(),
    };
    // Um padrão só. Dois significaria metade dos casos novos caindo no quadro que a
    // pessoa não está olhando.
    if (funil.padrao) this.funis.forEach((x) => (x.padrao = false));
    this.funis.push(funil);
    return funil;
  }
  async atualizarFunil(funilId: string, patch: Partial<FunilCrm>) {
    const f = this.funis.find((x) => x.id === funilId);
    if (!f) throw new Error("Funil não encontrado.");
    if (patch.padrao) this.funis.forEach((x) => (x.padrao = false));
    Object.assign(f, patch);
    return f;
  }
  async excluirFunil(funilId: string) {
    this.funis = this.funis.filter((x) => x.id !== funilId);
    this.etapas = this.etapas.filter((e) => e.funilId !== funilId);
    // O caso não vai junto: volta a ser distribuído pelo status.
    for (const l of Array.from(this.leads.values())) {
      if (l.funilId === funilId) { l.funilId = null; l.etapaId = null; }
    }
  }
  async listEtapas(funilId?: string) {
    return this.etapas
      .filter((e) => !funilId || e.funilId === funilId)
      .sort((a, b) => a.ordem - b.ordem);
  }
  async criarEtapa(e: { funilId: string; nome: string; ajuda?: string | null; status: EtapaCrm["status"]; ordem?: number }) {
    const etapa: EtapaCrm = {
      id: id("etapa"),
      funilId: e.funilId,
      nome: e.nome,
      ajuda: e.ajuda ?? null,
      status: e.status,
      ordem: e.ordem ?? this.etapas.filter((x) => x.funilId === e.funilId).length,
      arquivada: false,
    };
    this.etapas.push(etapa);
    return etapa;
  }
  async atualizarEtapa(etapaId: string, patch: Partial<EtapaCrm>) {
    const e = this.etapas.find((x) => x.id === etapaId);
    if (!e) throw new Error("Etapa não encontrada.");
    Object.assign(e, patch);
    return e;
  }
  async excluirEtapa(etapaId: string) {
    this.etapas = this.etapas.filter((x) => x.id !== etapaId);
    for (const l of Array.from(this.leads.values())) if (l.etapaId === etapaId) l.etapaId = null;
  }

  async registrarAcesso(entry: Omit<AccessLogEntry, "id" | "criadoEm">) {
    this.acessos.push({ ...entry, id: id("acesso"), criadoEm: now() });
  }
  async listAcessos(limit = 200) {
    return [...this.acessos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, limit);
  }
  async purgarDescartados(dias: number) {
    const corte = Date.now() - dias * 86_400_000;
    let apagados = 0;
    for (const [k, l] of Array.from(this.leads.entries())) {
      if (eFiltrada(l.classificacao) && !l.resgatadoEm && Date.parse(l.updatedAt) <= corte) {
        this.leads.delete(k);
        apagados++;
      }
    }
    return apagados;
  }
  async getLeadByConversation(conversationId: string) { return this.leads.get(conversationId) ?? null; }
  async listLeads(opcoes: { limite?: number } = {}) {
    // Mesma ordem do Supabase (mais recente primeiro), para o teto cortar a mesma ponta.
    const todos = Array.from(this.leads.values()).sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
    return opcoes.limite && opcoes.limite > 0 ? todos.slice(0, opcoes.limite) : todos;
  }
  async contarLeads() { return this.leads.size; }

  async listConversationsByIds(ids: string[]) {
    return ids.map((i) => this.conversations.get(i)).filter((c): c is Conversation => !!c);
  }

  /**
   * A mesma fila do Supabase, com as mesmas regras: os leads com prazo vêm TODOS e o
   * resto vem paginado, do mais parado para o mais recente. Ensaio, conversa filtrada e
   * caso encerrado ficam de fora dos dois — é o mesmo recorte de `montarFila`, feito
   * antes de contar em vez de depois, que é justamente o que consertou o "42 de 43".
   */
  async listLeadsDaFila(opcoes: { pagina: number; porPagina: number }) {
    const FILTRADAS = ["CURIOSO", "DPU", "FORA_ESCOPO"];
    const todos = Array.from(this.leads.values());
    const naFila = todos.filter((l) => {
      const conv = this.conversations.get(l.conversationId);
      if (ambienteDaConversa(conv) === "teste") return false;
      if (eFiltrada(l.classificacao)) return false;
      return l.atendimentoStatus !== "fechado" && l.atendimentoStatus !== "perdido";
    });
    const temPrazo = (l: Lead) =>
      !!l.temPrazoCorrendo || l.classificacao === "QUENTE_PRAZO" || !!l.prazoDataLimite;

    const comPrazo = naFila.filter(temPrazo);
    const resto = naFila
      .filter((l) => !temPrazo(l))
      .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
    const inicio = Math.max(0, (opcoes.pagina - 1) * opcoes.porPagina);

    return {
      comPrazo,
      normal: resto.slice(inicio, inicio + opcoes.porPagina),
      totalNormal: resto.length,
      totalFiltradas: todos.filter((l) => FILTRADAS.includes(l.classificacao ?? "")).length,
    };
  }
  async deleteLead(id: string) {
    for (const [k, v] of Array.from(this.leads.entries())) {
      if (v.id === id) { this.leads.delete(k); break; }
    }
  }

  async scheduleFollowup(conversationId: string, message: string, scheduledAt: string) {
    const f: Followup = { id: id("fup"), conversationId, message, scheduledAt, status: "pending", attempt: 1, createdAt: now() };
    this.followups.push(f);
    return f;
  }
  async listPendingFollowups() { return this.followups.filter((f) => f.status === "pending"); }
  async updateFollowupStatus(fid: string, status: FollowupStatus) {
    const f = this.followups.find((x) => x.id === fid); if (f) f.status = status;
  }
  async cancelPendingFollowups(conversationId: string) {
    for (const f of this.followups) {
      if (f.conversationId === conversationId && f.status === "pending") f.status = "cancelled";
    }
  }

  // ─── O FOLLOW-UP POR MOTIVO DE ESPERA ───

  private modelosFollowup: ModeloFollowup[] = [];
  private toques: ToqueDeFollowup[] = [];

  async listModelosFollowup() {
    return [...this.modelosFollowup];
  }
  async salvarModeloFollowup(modelo: Omit<ModeloFollowup, "id"> & { id?: string }) {
    // Um por (motivo, idioma) — dois seriam uma escolha silenciosa entre eles a cada
    // disparo, e ninguém saberia qual texto a pessoa recebeu.
    const i = this.modelosFollowup.findIndex(
      (m) => m.motivo === modelo.motivo && m.idioma === modelo.idioma,
    );
    const salvo: ModeloFollowup = { ...modelo, id: modelo.id ?? this.modelosFollowup[i]?.id ?? id("modelo") };
    if (i >= 0) this.modelosFollowup[i] = salvo;
    else this.modelosFollowup.push(salvo);
    return salvo;
  }
  async apagarModeloFollowup(modeloId: string) {
    this.modelosFollowup = this.modelosFollowup.filter((m) => m.id !== modeloId);
  }

  async listToques(leadId: string) {
    return this.toques
      .filter((t) => t.leadId === leadId)
      .sort((a, b) => Date.parse(b.criadoEm) - Date.parse(a.criadoEm));
  }
  async listToquesPendentes() {
    return this.toques
      .filter((t) => t.status === "rascunho" || t.status === "tarefa")
      .sort((a, b) => Date.parse(a.criadoEm) - Date.parse(b.criadoEm))
      .map((t) => ({
        ...t,
        contato: {
          nome: this.conversations.get(t.conversationId)?.contactName ?? null,
          whatsappNumber: this.conversations.get(t.conversationId)?.whatsappNumber ?? null,
        },
      }));
  }
  async registrarToque(toque: Omit<ToqueDeFollowup, "id" | "criadoEm" | "contato">) {
    const salvo: ToqueDeFollowup = { ...toque, id: id("toque"), criadoEm: now() };
    this.toques.push(salvo);
    return salvo;
  }
  async atualizarToque(toqueId: string, patch: Partial<ToqueDeFollowup>) {
    const i = this.toques.findIndex((t) => t.id === toqueId);
    if (i < 0) throw new Error("Toque não encontrado.");
    this.toques[i] = { ...this.toques[i], ...patch };
    return this.toques[i];
  }
  async contarToquesEnviadosHoje(instanciaId: string | null, agora: Date = new Date()) {
    const inicio = new Date(agora);
    inicio.setUTCHours(0, 0, 0, 0);
    return this.toques.filter(
      (t) =>
        t.status === "enviado" &&
        (t.instanciaId ?? null) === instanciaId &&
        t.enviadoEm != null &&
        Date.parse(t.enviadoEm) >= inicio.getTime(),
    ).length;
  }
  async listToquesDoPeriodo(de: string, ate: string) {
    return this.toques.filter((t) => t.criadoEm >= de && t.criadoEm <= ate);
  }
  async listLeadsComToqueVencido(agora: Date = new Date()) {
    return Array.from(this.leads.values())
      .filter((l) => l.proximoToqueEm && Date.parse(l.proximoToqueEm) <= agora.getTime())
      .sort((a, b) => Date.parse(a.proximoToqueEm!) - Date.parse(b.proximoToqueEm!));
  }

  async getConfig<T = unknown>(key: string) { return (this.config.get(key) as T) ?? null; }
  async setConfig(key: string, value: unknown) { this.config.set(key, value); }

  async upsertCliente(patch: Partial<Cliente> & { id?: string }): Promise<Cliente> {
    const existing = patch.id
      ? this.clientes.get(patch.id)
      : patch.cpf ? Array.from(this.clientes.values()).find((c) => c.cpf === patch.cpf) : undefined;
    const clienteId = existing?.id ?? patch.id ?? id("cli");
    const merged: Cliente = {
      createdAt: existing?.createdAt ?? now(),
      ...existing, ...patch, id: clienteId,
    } as Cliente;
    this.clientes.set(merged.id, merged);
    return merged;
  }
  async getCliente(cid: string) { return this.clientes.get(cid) ?? null; }
  async listClientes() {
    return Array.from(this.clientes.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async updateCliente(cid: string, patch: Partial<Cliente>): Promise<Cliente> {
    const existing = this.clientes.get(cid);
    if (!existing) throw new Error(`Cliente not found: ${cid}`);
    const updated: Cliente = { ...existing, ...patch, id: cid };
    this.clientes.set(cid, updated);
    return updated;
  }
  async deleteCliente(cid: string): Promise<void> {
    this.clientes.delete(cid);
  }

  async setEstado(conversationId: string, estado: FlowStateId) {
    const c = this.conversations.get(conversationId);
    if (c) c.estadoAtual = estado;
  }
  async setHandoff(conversationId: string, to: string, reason: string) {
    const c = this.conversations.get(conversationId);
    if (c) { c.handedOffTo = to; c.handoffReason = reason; c.status = "transferred"; }
  }

  async createTransferTicket(data: Omit<TransferTicket, "id" | "createdAt">) {
    const t: TransferTicket = { id: id("tkt"), createdAt: now(), ...data };
    this.tickets.set(t.id, t);
    return t;
  }
  async listTransferTickets() { return Array.from(this.tickets.values()); }
  async listTransferTicketsByConversation(conversationId: string) {
    return Array.from(this.tickets.values()).filter((t) => t.conversationId === conversationId);
  }

  async getUserByEmail(email: string) {
    return this.users.get(email.toLowerCase()) ?? null;
  }
  async createUser(data: { email: string; passwordHash: string; name?: string; role?: User["role"]; setor?: string | null }): Promise<User> {
    const user: User = {
      id: id("user"), email: data.email, passwordHash: data.passwordHash,
      // Default 'atendente' (o mais restrito), nunca 'admin': quem precisa de mais pede.
      name: data.name, role: data.role ?? "atendente", setor: (data.setor as User["setor"]) ?? null, active: true,
      // O PRIMEIRO ADMIN É O DONO — a mesma regra que a migration 030 aplica no banco.
      // Sem isso o repositório de memória (dev e testes) descreveria um sistema em que a
      // conta dona não existe, e a proteção só apareceria em produção.
      dono: (data.role ?? "atendente") === "admin" && !Array.from(this.users.values()).some((u) => u.dono),
      createdAt: now(),
    };
    this.users.set(data.email.toLowerCase(), user);
    return user;
  }
  async listUsers(): Promise<Array<Omit<User, "passwordHash">>> {
    return Array.from(this.users.values()).map((u) => ({
      id: u.id, email: u.email, name: u.name, role: u.role, setor: u.setor ?? null,
      active: u.active, createdAt: u.createdAt,
    }));
  }
  async updateUserPassword(id: string, passwordHash: string): Promise<void> {
    for (const [key, u] of Array.from(this.users.entries())) {
      if (u.id === id) { this.users.set(key, { ...u, passwordHash }); return; }
    }
  }

  /* ---------------------------------------------------------------- */
  /* ATIVAÇÃO — instâncias e modo sombra                               */
  /* ---------------------------------------------------------------- */

  async listInstancias() {
    return Array.from(this.instancias.values()).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  }
  async getInstancia(iid: string) { return this.instancias.get(iid) ?? null; }
  async getInstanciaPorInstanceId(instanceId: string) {
    return Array.from(this.instancias.values()).find((i) => i.instanceId === instanceId) ?? null;
  }
  async criarInstancia(dados: { nome: string; instanceId: string; token: string; clientToken?: string | null; baseUrl?: string }) {
    // A MESMA TRAVA DO BANCO, AQUI. `ambiente` e `ativo` são escritos por este método e
    // não vêm de fora: teste e desligada, sempre. O trigger da migration 023 faz o mesmo
    // no Supabase — as duas implementações precisam concordar, e há teste para isso.
    const inst: ZapiInstancia = {
      id: id("inst"), nome: dados.nome, ambiente: "teste",
      instanceId: dados.instanceId, token: dados.token,
      clientToken: dados.clientToken ?? null,
      baseUrl: dados.baseUrl || "https://api.z-api.io",
      ativo: false, ativadoPor: null, ativadoEm: null,
      modoDesligado: "sombra", respostaFixa: null, slaMinutos: 30,
      criadoEm: now(), atualizadoEm: now(),
    };
    this.instancias.set(inst.id, inst);
    return inst;
  }
  async atualizarInstancia(iid: string, patch: Partial<ZapiInstancia>) {
    const atual = this.instancias.get(iid);
    if (!atual) throw new Error("instancia_nao_encontrada");
    // `ativo` fora do patch: quem liga é definirAtivacaoInstancia, que exige o autor.
    const aceito = { ...patch };
    delete aceito.ativo;
    delete aceito.ativadoPor;
    delete aceito.ativadoEm;
    const novo: ZapiInstancia = { ...atual, ...aceito, id: atual.id, atualizadoEm: now() };
    // Silêncio total é privilégio de teste — a mesma regra do check do banco.
    if (novo.modoDesligado === "silencio" && novo.ambiente === "producao") {
      throw new Error("silencio_so_em_teste");
    }
    this.instancias.set(iid, novo);
    return novo;
  }
  async definirAtivacaoInstancia(iid: string, ativo: boolean, autor: string) {
    const atual = this.instancias.get(iid);
    if (!atual) throw new Error("instancia_nao_encontrada");
    const novo: ZapiInstancia = {
      ...atual, ativo,
      ativadoPor: ativo ? autor : null,
      ativadoEm: ativo ? now() : null,
      atualizadoEm: now(),
    };
    this.instancias.set(iid, novo);
    return novo;
  }
  async excluirInstancia(iid: string) { this.instancias.delete(iid); }

  async criarRascunho(r: { conversationId: string; messageId?: string | null; texto: string; botoes?: Array<{ id: string; label: string }> | null }) {
    const rasc: RascunhoAgente = {
      id: id("rasc"), conversationId: r.conversationId, messageId: r.messageId ?? null,
      texto: r.texto, botoes: r.botoes ?? null, status: "pendente",
      textoEnviado: null, motivo: null, decididoPor: null, decididoEm: null, criadoEm: now(),
    };
    this.rascunhos.push(rasc);
    return rasc;
  }
  async listRascunhos(opts: { conversationId?: string; status?: RascunhoStatus; limit?: number } = {}) {
    return this.rascunhos
      .filter((r) => (!opts.conversationId || r.conversationId === opts.conversationId)
        && (!opts.status || r.status === opts.status))
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
      .slice(0, opts.limit ?? 200)
      .map((r) => {
        const c = this.conversations.get(r.conversationId);
        return { ...r, contato: c ? { nome: c.contactName, whatsappNumber: c.whatsappNumber } : null };
      });
  }
  async getRascunho(rid: string) { return this.rascunhos.find((r) => r.id === rid) ?? null; }
  async decidirRascunho(
    rid: string,
    decisao: { status: "enviado" | "descartado"; textoEnviado?: string | null; motivo?: string | null },
    autor: string,
  ) {
    const i = this.rascunhos.findIndex((r) => r.id === rid);
    // Só decide o que ainda está pendente — trava contra o clique duplo.
    if (i < 0 || this.rascunhos[i].status !== "pendente") return null;
    const novo: RascunhoAgente = {
      ...this.rascunhos[i],
      status: decisao.status,
      textoEnviado: decisao.textoEnviado ?? null,
      motivo: decisao.motivo ?? null,
      decididoPor: autor, decididoEm: now(),
    };
    this.rascunhos[i] = novo;
    return novo;
  }
}
