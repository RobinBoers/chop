import remarkGemoji from "remark-gemoji";
import remarkLinkRewrite from "remark-link-rewrite";
import rehypeFormat from "rehype-format";


const format = function(options = {}) {
  return {
    rehypePlugin: rehypeFormat,
    rehypeOptions: options
  }
}

const emoji = function(options = {}) {
  return {
    remarkPlugin: remarkGemoji,
    remarkOptions: options
  }
}

const images = function(options = {}) {
  return {
    rehypePlugin: remarkUnwrapImages,
    rehypeOptions: options
  }
}

const prefixLinks = function({ linkPrefix }) {
  const prefixURL = function(url) {
    const isRelative = /^\/(?!\/)/;

    if (isRelative.test(url)) return linkPrefix + url;
    return url;
  };

  const prefixPath = function(path, variables) {
    return `${variables.site_prefix || ""}${path}`;
  }

  return {
    processVariables(variables) {
      return { 
        ...variables, 
        path: prefixPath(path, linkPrefix), 
        path_unprefixed: path 
      };
    },

    gemdownOptions: { linkPrefix },

    remarkPlugin: remarkLinkRewrite,
    remarkOptions: { replacer: prefixURL }
  };
}