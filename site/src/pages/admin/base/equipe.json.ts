import equipe from "../../../data/equipe.json";
import { CARGOS } from "../../../config";
export const GET = () => new Response(JSON.stringify(equipe.map((e) => ({ slug: e.slug, nome: e.nome, foto: e.foto, description: e.description, cargo: CARGOS[e.slug] ?? null }))));
