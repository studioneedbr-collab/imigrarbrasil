import rss from "@astrojs/rss";
import posts from "../data/posts.json";

export function GET(context) {
  return rss({
    title: "Blog Imigrar Brasil",
    description: "Vistos, residência, naturalização e a vida do imigrante no Brasil.",
    site: context.site,
    items: posts.map((p) => ({ title: p.title, description: p.description ?? "", pubDate: new Date(p.published), link: `/${p.slug}/` })),
    customData: "<language>pt-br</language>",
  });
}
