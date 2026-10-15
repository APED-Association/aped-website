// Extra pages APED adds in the editor (events, fundraisers, announcements).
// Each file becomes apedassociation.org/<file-name>/. Unticking "Live on the
// website" keeps a draft out of the build.
const RESERVED = new Set(["admin", "assets", "news", "index"]);

module.exports = {
  layout: "page.njk",
  standalone: true,
  root: "/",
  eleventyComputed: {
    permalink: (data) => {
      if (data.published === false) return false;
      const slug = data.page.fileSlug;
      return "/" + (RESERVED.has(slug) ? "page-" + slug : slug) + "/";
    },
  },
};
