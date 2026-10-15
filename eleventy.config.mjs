// Eleventy build for apedassociation.org.
//
// Every editable word and photo lives in content/*.json (one file per page) and
// content/pages/*.md (extra pages APED adds themselves). Pages CMS edits those
// files; each save commits to main, and .github/workflows/deploy.yml rebuilds and
// publishes the site to GitHub Pages in about a minute.

import fs from "node:fs";
import path from "node:path";
import markdownIt from "markdown-it";

const CONTENT_FILES = [
  "site", "home", "about", "impact", "project", "involve",
  "contact", "donate", "thanks", "team", "blog",
];

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Inline Markdown: **bold**, *italic*, [label](url). Escapes first.
function mdInline(t) {
  t = esc(t);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, url) => {
    const external = /^https?:/i.test(url);
    if (!external && /^[a-z][a-z0-9+.-]*:/i.test(url) && !/^mailto:/i.test(url)) return whole;
    return '<a href="' + url + '"' + (external ? ' target="_blank" rel="noopener"' : "") + ">" + label + "</a>";
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return t;
}

// Full Markdown for news articles and extra pages (what the editor's rich-text box
// saves). Links to other websites open in a new tab.
const md = markdownIt({ html: true, linkify: true });
const renderLink = md.renderer.rules.link_open ||
  ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  if (/^https?:/i.test(tokens[idx].attrGet("href") || "")) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noopener");
  }
  return renderLink(tokens, idx, options, env, self);
};

// Whole years since a YYYY-MM-DD date, as of the build. The site rebuilds daily,
// so "{years}" rolls over on the anniversary without anyone editing it.
function yearsSince(isoDate) {
  const [y, m, d] = String(isoDate).split("-").map(Number);
  const now = new Date();
  let years = now.getUTCFullYear() - y;
  const beforeAnniversary =
    now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d);
  if (beforeAnniversary) years -= 1;
  return years;
}

export default function (eleventyConfig) {
  eleventyConfig.setNunjucksEnvironmentOptions({ autoescape: true });

  for (const name of CONTENT_FILES) {
    eleventyConfig.addGlobalData(name, () =>
      JSON.parse(fs.readFileSync(path.join("content", name + ".json"), "utf8")),
    );
  }
  eleventyConfig.addGlobalData("year", () => new Date().getUTCFullYear());

  eleventyConfig.addCollection("extraPages", (api) =>
    api.getFilteredByGlob("content/pages/*.md").sort((a, b) =>
      String(a.data.title).localeCompare(String(b.data.title)),
    ),
  );

  // Image paths: the editor saves "/assets/photos/x.webp"; the site uses relative
  // paths so it also works under a preview subpath.
  eleventyConfig.addFilter("asset", (p) => String(p || "").replace(/^\/+/, ""));
  // Multi-line text: one line break in the editor = one <br> on the page.
  eleventyConfig.addFilter("lines", (t) => esc(t).replace(/\r?\n/g, "<br>"));
  // Wrap one word or phrase of a headline in <em> (shown in yellow).
  eleventyConfig.addFilter("highlight", (t, word) => {
    const e = esc(t);
    if (!word) return e;
    const w = esc(word);
    return e.includes(w) ? e.replace(w, "<em>" + w + "</em>") : e;
  });
  eleventyConfig.addFilter("inline", mdInline);
  eleventyConfig.addFilter("markdown", (src) => md.render(String(src || "")));
  eleventyConfig.setLibrary("md", md);
  // "{years}" in any number field = years since the founding date in Site settings.
  eleventyConfig.addFilter("tokens", function (t) {
    const founded = this.ctx?.site?.founded || this.context?.environments?.site?.founded || "1998-10-18";
    return String(t == null ? "" : t).replace(/\{years\}/g, String(yearsSince(founded)));
  });
  eleventyConfig.addFilter("pad2", (n) => String(n).padStart(2, "0"));
  eleventyConfig.addFilter("byRateDesc", (list) =>
    [...(list || [])].sort((a, b) => Number(b.rate) - Number(a.rate)),
  );
  eleventyConfig.addFilter("newestFirst", (posts) =>
    [...(posts || [])].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))),
  );

  for (const p of ["assets", "admin", "news", "CNAME"]) {
    eleventyConfig.addPassthroughCopy(p);
  }

  return {
    dir: { input: ".", includes: "_includes", output: "_site" },
    templateFormats: ["njk", "md"],
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk",
  };
}
