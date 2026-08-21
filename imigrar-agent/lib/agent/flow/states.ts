import type { FlowStateId } from "@/lib/domain/types";

export interface StateDef {
  id: FlowStateId;
  message: string;
  options?: Record<string, FlowStateId>;
  transfer?: boolean;
  terminal?: boolean;
}

export const STATES: Record<FlowStateId, StateDef> = {
  S0: { id: "S0", message: "Bem-vindo à Shine Rio, a empresa de terceirização que mais cresce no Brasil! 🌟", options: { "": "S1" } },
  S1: { id: "S1", message: "Para prosseguir com o atendimento, me diz seu nome completo e CPF, por favor.", options: { "*": "S2" } },
  S2: { id: "S2", message: "Você é:\n1️⃣ Cliente (quer contratar ou orçar)\n2️⃣ Funcionário (suporte interno)", options: { "1": "S3", "2": "S10" } },
  S3: { id: "S3", message: "Qual setor você procura?\n1️⃣ Comercial\n2️⃣ Operacional\n3️⃣ Recursos Humanos", options: { "1": "S4", "2": "S9", "3": "S3" } },
  S4: { id: "S4", message: "No Comercial, o que você precisa?\n1️⃣ Solicitar orçamento\n2️⃣ Conhecer nossos serviços\n3️⃣ Falar com um consultor\n4️⃣ Renovação ou alteração de contrato", options: { "1": "S5", "2": "S6", "3": "S7", "4": "S8" } },
  S5: { id: "S5", message: "Perfeito! Para preparar sua proposta, me informe: nome da empresa, quantidade aproximada de colaboradores, serviço desejado e a cidade.", options: { "*": "S5" } },
  S6: { id: "S6", message: "A Shine Rio oferece soluções completas em terceirização de mão de obra, com foco em qualidade, agilidade e excelência operacional. Sobre qual serviço você quer saber mais?", options: { "*": "S6" } },
  S7: { id: "S7", message: "Perfeito! Vou te encaminhar para um de nossos consultores comerciais. Se quiser, já pode descrever sua necessidade para agilizar.", transfer: true, terminal: true },
  S8: { id: "S8", message: "Certo! Me informe o nome da empresa e descreva a renovação ou alteração desejada no contrato — nossa equipe comercial dá sequência.", transfer: true, terminal: true },
  S9: { id: "S9", message: "Para direcionarmos sua solicitação ao setor responsável, escolha uma das opções abaixo:\n1️⃣ Registrar uma ocorrência\n2️⃣ Solicitar apoio operacional\n3️⃣ Acompanhar uma solicitação\n4️⃣ Falar com um supervisor", options: { "*": "S9" } },
  S10: { id: "S10", message: "Para direcionarmos seu atendimento interno, escolha o setor:\n1️⃣ Departamento Pessoal (folha, benefícios, férias, admissões, rescisões, documentação)\n2️⃣ Recursos Humanos (recrutamento, vagas, currículos, treinamentos)", options: { "*": "S10" } },
};

export const CLOSING = "Sua solicitação foi registrada e será encaminhada ao setor responsável. Permanecemos à disposição sempre que precisar. Tenha um excelente dia! 😊";
