#!/usr/bin/env fish

rm -rf dist
bun build ./chop.js --outdir ./dist
mv dist/chop.js dist/chop
