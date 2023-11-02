// More languages can be supported later, just install
// a parsed and add it to `renderContent` 
// (see render pipeline in main file).

const gemdown = await import("gemdown");

import { unified } from "unified";
import {retext} from "retext";
import retextSmartypants from "retext-smartypants";
import remarkParse from "remark-parse";
import remarkLinkRewrite from "remark-link-rewrite";
import remarkGfm from "remark-gfm";
import remarkGemoji from "remark-gemoji";
import smartypants from "remark-smartypants";
import remarkRehype from "remark-rehype";
import remarkUnwrapImages from "remark-unwrap-images";
import rehypeFormat from "rehype-format";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";

const md2gemtext = async function(markdown, options) {
  const prose = await retext()
    .use(retextSmartypants)
    .process(markdown);

  return gemdown.parse(String(prose), options);
};

const md2html = async function(markdown, { linkPrefix }) {
  const prefixURL = function(url) {
    const isRelative = /^\/(?!\/)/;

    if (isRelative.test(url)) return linkPrefix + url
    return url
  }

  const html = await unified()
    .use(remarkParse)
    .use(remarkLinkRewrite, { replacer: prefixURL })
    .use(remarkGfm)
    .use(remarkGemoji)
    .use(smartypants)
    .use(remarkRehype)
    .use(remarkUnwrapImages)
    .use(rehypeSlug)
    .use(rehypeFormat)
    .use(rehypeStringify)
    .process(markdown);

  return String(html);
};

const md2txt = (x) => x;

export { md2gemtext, md2html, md2txt }
