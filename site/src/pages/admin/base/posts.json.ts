// Os artigos como o build os conhece. O /admin (public/admin) parte destes e aplica por cima
// o que foi criado ou editado no servidor. O nginx manda /admin/ inteiro para o PHP, então
// este arquivo nunca é servido ao público.
import posts from "../../../data/posts.json";
export const GET = () => new Response(JSON.stringify(posts));
