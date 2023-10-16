// More languages can be supported later, just install
// a parsed and add it to `renderContent` 
// (see render pipeline in main file).

const gemdown = await import("gemdown");
const { marked } = await import("marked");
const { gfmHeadingId } = await import("marked-gfm-heading-id");
const { markedSmartypants } = await import("marked-smartypants");
const { markedHighlight } = await import("marked-highlight");
const hljs = await import("highlight.js");

marked.use(gfmHeadingId());
marked.use(markedSmartypants());

marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  })
);

let md2gemini = gemdown.parse;
let md2html = marked;

export { md2gemini, md2html }
