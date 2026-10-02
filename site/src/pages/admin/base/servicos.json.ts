import servicos from "../../../data/servicos.json";
export const GET = () => new Response(JSON.stringify(servicos.map((s) => ({ slug: s.slug, title: s.title, description: s.description, modified: s.modified ?? null }))));
