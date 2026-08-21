// Catálogo oficial de funções que a Shine Rio presta.
// Fonte: "RESUMO DO AGENTE COMERCIAL DE IA.docx", pergunta 1.
//
// IMPORTANTE — nenhum salário aqui. A planilha de composição de custos 2026 traz UMA
// única função fechada (Auxiliar de Serviços Gerais, aba SERVENTE). Para todas as outras
// a Shine ainda não passou o piso da CCT, então elas entram como "sob consulta": a
// Shayene reconhece a função e diz que confirma o valor com o comercial, em vez de
// chutar um preço. Quando o piso chegar, basta preencher o salário base na tela
// Comercial → Preços por função e marcar "preço confirmado".
//
// uniformeMes: os dois únicos kits que a planilha precifica (aba UNIFORME).
//   - servente (jaleco, calça brim, meia, sapato, crachá) ...... R$ 46,97/mês
//   - porteiro/vigia (calça e camisa social, meia, sapato social) R$ 58,50/mês

export const UNIFORME_SERVENTE = 46.97;
export const UNIFORME_PORTEIRO = 58.5;

/** Minúsculas, sem acento e sem espaço sobrando — para comparar nome de função. */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Como o cliente e a Shayene escrevem na prática. Sem isto, "ASG" não acha
// "Auxiliar de Serviços Gerais" e a proposta é recusada por engano — o que empurraria
// para o humano justamente a única função que ela sabe cotar.
const APELIDOS: Record<string, string> = {
  asg: "Auxiliar de Serviços Gerais",
  "aux de servicos gerais": "Auxiliar de Serviços Gerais",
  "aux. de servicos gerais": "Auxiliar de Serviços Gerais",
  "auxiliar de servicos gerais": "Auxiliar de Serviços Gerais",
  "auxiliar servicos gerais": "Auxiliar de Serviços Gerais",
};

/**
 * Devolve o nome canônico da função, ou undefined se não reconhecer. Ignora caixa,
 * acento e apelidos comuns. Não faz busca aproximada de propósito: errar a função é
 * errar o preço, e é melhor recusar e mandar para o humano do que cotar outra coisa.
 */
export function resolveFunctionName(input: string): string | undefined {
  const n = normalizar(input);
  if (!n) return undefined;
  if (APELIDOS[n]) return APELIDOS[n];
  return FUNCTION_CATALOG.find((f) => normalizar(f.name) === n)?.name;
}

export interface CatalogFunction {
  name: string;
  /** Só orienta o uniforme e a escala padrão — não entra no preço. */
  group:
    | "limpeza"
    | "portaria"
    | "administrativo"
    | "manutencao"
    | "industrial"
    | "logistica"
    | "cozinha"
    | "piscina"
    | "educacional"
    | "saude"
    | "supervisao";
  schedule: string;
  uniformeMes: number;
}

const L = (name: string): CatalogFunction => ({ name, group: "limpeza", schedule: "5x2_44h", uniformeMes: UNIFORME_SERVENTE });
// Portaria/vigilância: escala 12x36 é o padrão do setor e é a escala já usada no posto
// de Porteiro. Confirme a escala real do contrato antes de fechar preço.
const P = (name: string): CatalogFunction => ({ name, group: "portaria", schedule: "12x36", uniformeMes: UNIFORME_PORTEIRO });
const A = (name: string): CatalogFunction => ({ name, group: "administrativo", schedule: "5x2_44h", uniformeMes: UNIFORME_PORTEIRO });
const M = (name: string): CatalogFunction => ({ name, group: "manutencao", schedule: "5x2_44h", uniformeMes: UNIFORME_SERVENTE });
const I = (name: string): CatalogFunction => ({ name, group: "industrial", schedule: "5x2_44h", uniformeMes: UNIFORME_SERVENTE });
const G = (name: string): CatalogFunction => ({ name, group: "logistica", schedule: "5x2_44h", uniformeMes: UNIFORME_SERVENTE });
const C = (name: string): CatalogFunction => ({ name, group: "cozinha", schedule: "5x2_44h", uniformeMes: UNIFORME_SERVENTE });
const S = (name: string): CatalogFunction => ({ name, group: "piscina", schedule: "5x2_44h", uniformeMes: UNIFORME_SERVENTE });
const E = (name: string): CatalogFunction => ({ name, group: "educacional", schedule: "5x2_44h", uniformeMes: UNIFORME_SERVENTE });
const H = (name: string): CatalogFunction => ({ name, group: "saude", schedule: "5x2_44h", uniformeMes: UNIFORME_SERVENTE });
const V = (name: string): CatalogFunction => ({ name, group: "supervisao", schedule: "5x2_44h", uniformeMes: UNIFORME_PORTEIRO });

export const FUNCTION_CATALOG: CatalogFunction[] = [
  // ---- Limpeza e conservação ----
  L("Auxiliar de Serviços Gerais"),
  L("Servente"),
  L("Faxineira"),
  L("Auxiliar de Limpeza"),
  L("Limpador"),
  L("Limpador de Vidro"),
  L("Limpador de Caixa d'Água"),
  L("Limpador de Fachada com Rapel"),
  L("Alpinista Predial"),
  L("Alpinista Industrial"),
  L("Operador de Máquina de Limpeza Tripulada"),
  L("Enfermeira Supervisora de Higienização"),
  L("Auxiliar de Dedetização"),
  L("Dedetizador sem Moto"),
  L("Dedetizador com Moto"),

  // ---- Portaria, vigia e controle de acesso ----
  P("Porteiro"),
  P("Auxiliar de Portaria"),
  P("Porteiro/Vigia Terceirizado/Zelador"),
  P("Vigia"),
  P("Vigia Terceirizado com Moto"),
  P("Controlador de Acesso"),
  P("Operador de CFTV"),
  P("Operador Central de Controle Operacional"),

  // ---- Recepção e administrativo ----
  A("Recepcionista"),
  A("Recepcionista Pleno (Bilíngue)"),
  A("Recepcionista Senior (Trilíngue)"),
  A("Auxiliar de Escritório"),
  A("Agente Administrativo"),
  A("Assistente Administrativo"),
  A("Assistente Administrativo Pleno"),
  A("Assistente Administrativo Senior"),
  A("Digitador"),
  A("Escriturário Datilógrafo"),
  A("Técnico em Secretariado"),
  A("Auxiliar de Secretaria"),
  A("Tramitador de Documentos"),
  A("Operador de Copiadora"),
  A("Operador de Serviço de Atendimento ao Usuário"),
  A("Contínuo"),
  A("Mensageiro"),
  A("Arrecadador"),
  A("Almoxarife"),
  A("Auxiliar de Almoxarife"),

  // ---- Manutenção predial e jardinagem ----
  M("Zelador"),
  M("Auxiliar de Manutenção"),
  M("Jardineiro"),
  M("Auxiliar de Jardinagem"),
  M("Operador de Roçadeira"),
  M("Operador de Microtrator"),
  M("Operador de Moto Serra"),
  M("Eletricista"),
  M("Serralheiro"),
  M("Marceneiro"),

  // ---- Industrial e metalmecânica ----
  I("Soldador"),
  I("Caldeireiro"),
  I("Ajustador Mecânico"),
  I("Mecânico de Máquinas"),
  I("Torneiro Mecânico"),
  I("Retificador"),
  I("Mandrilhador"),
  I("Ferramenteiro"),
  I("Fresador"),
  I("Eletromecânico"),
  I("Operador CNC"),
  I("Técnico de Automação"),
  I("Montador"),
  I("Auxiliar de Produção"),

  // ---- Logística e armazém ----
  G("Ajudante de Armazém"),
  G("Auxiliar de Embalagem"),
  G("Operador de Empilhadeira"),
  G("Remanejador"),
  G("Triciclista"),
  G("Manobrista"),

  // ---- Cozinha e nutrição ----
  C("Auxiliar de Cozinha"),
  C("Cozinheira"),
  C("Cozinheira Escolar"),
  C("Chefe de Cozinha"),
  C("Copeira"),
  C("Garçom"),
  C("Manipulador de Alimentos"),
  C("Técnico de Nutrição"),
  C("Nutricionista"),

  // ---- Piscina e salvamento ----
  S("Operador de Piscina"),
  S("Guardião de Piscina"),
  S("Supervisor de Piscina"),
  S("Salva-Vidas Civil"),

  // ---- Educacional ----
  E("Apoio Escolar"),
  E("Inspetor de Alunos"),
  E("Auxiliar de Educação Infantil"),
  E("Auxiliar de Ensino Fundamental"),
  E("Auxiliar de Ensino Médio"),
  E("Coordenador de Turno"),
  E("Coordenador Pedagógico"),
  E("Coordenador de Área"),
  E("Orientador Educacional"),

  // ---- Saúde e social ----
  H("Maqueiro"),
  H("Psicólogo"),
  H("Assistente Social"),

  // ---- Supervisão e liderança ----
  V("Encarregado"),
  V("Supervisor"),
  V("Inspetor de Serviços"),
  V("Chefe de Departamento ou Seção"),
];
