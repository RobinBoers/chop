import {toString} from 'hast-util-to-string'
import {SKIP, visit} from 'unist-util-visit';

// To match *any* liquid syntax
const liquidExpression = /^\{+?[^\}]*?\}+?$/;

// To match just blocks
const liquidTag = /^\{\%[^\}]*?\%\}$/;

export default function rehypeUnwrapLiquid() {
  return function (tree) {
    visit(tree, 'paragraph', function (node, index, parent) {
      if (
        parent &&
        typeof index == 'number' &&
        isLiquidTag(node)
      ) {
        parent.children.splice(index, 1, ...node.children)
        return [SKIP, index]
      }
    })
  }
}

function isLiquidTag(node) {
  const textContent = toString(node);
  console.log(textContent);
  return textContent.match(liquidTag);
}