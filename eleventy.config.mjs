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
  "home", "about", "impact", "project", "involve",
  "contact", "donate", "thanks", "team", "blog", "campaign",
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

function readContent(name) {
  return JSON.parse(fs.readFileSync(path.join("content", name + ".json"), "utf8"));
}

// The Laying the Foundation budget. Every figure on that section is worked out here
// from content/campaign.json, so one edit (a lot's FCFA amount, the reserve percent,
// the VAT percent, the exchange rate) changes the table, the totals and the goal together.
// FCFA amounts are the budget; US dollars are always derived from them with the one
// rate in the file and rounded the same way, so no two numbers can disagree.
//
// The goal is not typed anywhere. It is worked out from the Lot 1 FCFA amount (before any
// rounding to dollars) by goal_mode:
//   lot_only     = Lot 1
//   with_reserve = Lot 1 x (1 + reserve percent)
//   all_in       = Lot 1 x (1 + reserve percent) x (1 + VAT percent, only if vat_applies)
// The Donate side panel, the Home progress card and the Our Project funding card read the
// same goal and raised figures (see the "site" global data below).
const GOAL_MODES = ["lot_only", "with_reserve", "all_in"];

function campaignView(c) {
  c = c || {};
  const rate = Number(c.rate_fcfa_per_usd) || 0;
  const step = Number(c.round_usd_to) || 1;
  const whole = (n) => Math.round(n).toLocaleString("en-US");
  const usd = (fcfa) => (rate ? Math.round(fcfa / rate / step) * step : 0);
  const row = (fcfa) => ({ fcfa, fcfa_text: whole(fcfa), usd_text: rate ? "$" + whole(usd(fcfa)) : "" });

  const lots = (c.lots || []).map((l) => ({ ...l, ...row(Number(l.fcfa) || 0) }));
  const subtotal = lots.reduce((sum, l) => sum + l.fcfa, 0);
  const percent = Number(c.reserve_percent) || 0;
  const reserve = Math.round((subtotal * percent) / 100);

  // VAT is charged on the lots plus the reserve. If vat_applies is false (an exemption),
  // the row, the footnote and the VAT inside every total and the goal all drop out.
  const vatPercent = Number(c.vat_percent) || 0;
  const vatApplies = c.vat_applies !== false && vatPercent > 0;
  const vat = vatApplies ? Math.round(((subtotal + reserve) * vatPercent) / 100) : 0;
  const total = subtotal + reserve + vat;

  const goalMode = c.goal_mode || "all_in";
  if (!GOAL_MODES.includes(goalMode)) {
    throw new Error(`content/campaign.json: goal_mode "${goalMode}" is not one of ${GOAL_MODES.join(", ")}.`);
  }
  if (!rate) throw new Error("content/campaign.json: rate_fcfa_per_usd is missing, so the goal cannot be worked out.");
  const lotOne = lots.find((l) => l.this_campaign) || lots.find((l) => Number(l.number) === 1) || lots[0];
  let goalFcfa = lotOne ? lotOne.fcfa : 0;
  if (goalMode !== "lot_only") goalFcfa = (goalFcfa * (100 + percent)) / 100;
  if (goalMode === "all_in" && vatApplies) goalFcfa = (goalFcfa * (100 + vatPercent)) / 100;
  const goal = usd(goalFcfa);

  const raised = Number(c.raised_usd) || 0;
  const filled = goal > 0 ? Math.min(100, Math.max(0, (raised / goal) * 100)) : 0;

  // One sentence saying what the goal covers, chosen by goal_mode. "all_in" without VAT
  // (an exemption) covers exactly what "with_reserve" does, so it uses that sentence.
  const basisKey = goalMode === "all_in" && !vatApplies ? "with_reserve" : goalMode;
  const goalBasis = String((c.goal_basis || {})[basisKey] || "")
    .replace(/\{reserve_percent\}/g, String(percent))
    .replace(/\{vat_percent\}/g, String(vatPercent));

  // Where this campaign sits in the building: stage n of the number of lots.
  const stage = lotOne ? lots.indexOf(lotOne) + 1 : 1;

  return {
    lots,
    stage,
    stages: lots.length,
    goal_basis: goalBasis,
    subtotal: row(subtotal),
    reserve: { ...row(reserve), percent },
    vat: vatApplies ? { ...row(vat), percent: vatPercent } : null,
    vat_note: String(c.vat_note || "").replace(/\{vat_percent\}/g, String(vatPercent)),
    vat_note_unconfirmed: vatApplies && c.vat_note_confirmed !== true,
    total: row(total),
    total_label: vatApplies ? c.total_label : (c.total_label_without_vat || "Construction total"),
    rate_text: String(rate),
    step_text: "$" + whole(step),
    goal_mode: goalMode,
    goal_text: "$" + whole(goal),
    goal_unconfirmed: c.goal_confirmed !== true,
    raised_text: "$" + whole(raised),
    filled: filled.toFixed(1),
    percent_funded: Math.floor(filled),
  };
}

// Printed once per build, in the Actions log too, while APED has not signed off. It never
// fails the build: the staging branch is meant to show the figures. It is there so the
// unconfirmed numbers cannot reach the live site without someone seeing this.
function warnUnconfirmed() {
  const v = campaignView(readContent("campaign"));
  const problems = [];
  if (v.goal_unconfirmed) {
    problems.push(
      `Goal ${v.goal_text} (goal_mode "${v.goal_mode}") is NOT confirmed by APED. ` +
      `content/campaign.json has goal_confirmed: false.`,
    );
  }
  if (v.vat_note_unconfirmed) {
    problems.push(
      "The VAT line and its footnote wording are NOT approved by APED. " +
      "content/campaign.json has vat_note_confirmed: false.",
    );
  }
  if (!problems.length) return;
  const bar = "!".repeat(78);
  console.warn(["", bar, "!!  LAYING THE FOUNDATION: NOT READY TO GO LIVE", ...problems.map((t) => "!!  " + t),
    "!!  Set the flag to true only after APED confirms the figure or the wording.", bar, ""].join("\n"));
  if (process.env.GITHUB_ACTIONS) {
    for (const t of problems) console.warn("::warning title=Laying the Foundation not confirmed::" + t);
  }
}

export default function (eleventyConfig) {
  eleventyConfig.setNunjucksEnvironmentOptions({ autoescape: true });
  eleventyConfig.addFilter("campaignView", campaignView);

  eleventyConfig.on("eleventy.before", warnUnconfirmed);

  for (const name of CONTENT_FILES) {
    eleventyConfig.addGlobalData(name, () => readContent(name));
  }
  // The raised and goal figures on Home, Our Project and the Donate side panel are the
  // Foundation campaign's own, so they come from content/campaign.json (one source of
  // truth). Site settings keeps only the phase name and the total project cost.
  eleventyConfig.addGlobalData("site", () => {
    const site = readContent("site");
    const v = campaignView(readContent("campaign"));
    site.fundraising = {
      ...site.fundraising,
      raised: v.raised_text,
      phase_goal: v.goal_text,
      percent_funded: v.percent_funded,
      goal_unconfirmed: v.goal_unconfirmed,
    };
    return site;
  });
  eleventyConfig.addGlobalData("year", () => new Date().getUTCFullYear());

  // News articles are standalone pages copied as-is from news/<slug>/index.html, so
  // Eleventy does not know about them. This lists them for sitemap.xml.
  eleventyConfig.addGlobalData("newsArticles", () =>
    fs.readdirSync("news", { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join("news", d.name, "index.html")))
      .map((d) => "/news/" + d.name + "/")
      .sort(),
  );

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
  // "{goal}" = the Foundation campaign goal from Laying the Foundation (e.g. $40,300).
  eleventyConfig.addFilter("tokens", function (t) {
    const founded = this.ctx?.site?.founded || this.context?.environments?.site?.founded || "1998-10-18";
    return String(t == null ? "" : t)
      .replace(/\{years\}/g, String(yearsSince(founded)))
      .replace(/\{goal\}/g, campaignView(readContent("campaign")).goal_text);
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
