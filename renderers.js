// More languages can be supported later, just install
// a parsed and add it to `renderContent` 
// (see render pipeline in main file).

const gemdown = await import("gemdown");

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStrinify from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkUnwrapImages from "remark-unwrap-images";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";

const md2gemtext = async function(markdown, { plugins }) {
  let processor = unified()
    .use(remarkParse)
    .use(remarkGfm)

  plugins.forEach({ remarkPlugin, remarkOptions } => {
    processor.use(remarkPlugin, remarkOptions);
  })

  processor.use(remarkStrinify)
  const markdown = processor.process(markdown);

  let options = {};
  plugins.forEach(plugin => {
    options = { ...options, plugin.gemtextOptions };
  });

  return gemdown.parse(String(markdown), options);
};

const md2html = async function(markdown, { plugins }) {
  let processor = unified()
    .use(remarkParse)
    .use(remarkGfm)

  plugins.forEach({ remarkPlugin, remarkOptions } => {
    processor.use(remarkPlugin, remarkOptions);
  })

  processor
    .use(remarkRehype)
    .use(rehypeSlug)

  plugins.forEach({ rehypePlugin, rehypeOptions } => {
    processor.use(rehypePlugin, rehypeOptions);
  })
    
  // We trust content
  processor.use(rehypeStringify, {
      allowDangerousCharacters: true,
      allowDangerousHtml: true,
      characterReferences: {
        useNamedReferences: true
      }
    })

  const html = processor.process(markdown);
  return String(html);
};

const md2txt = (x) => x;

export { md2gemtext, md2html, md2txt }
