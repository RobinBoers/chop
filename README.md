# Chop

Very minimal SSG generator based on Liquid-based templates. Written in ~200 lines of spaghetti JavaScript, utilizing the new Bun runtime.

## Content

Content is written in [CommonMark](https://commonmark.org/) Markdown. Chop also supports [Front Matter](https://jekyllrb.com/docs/front-matter/), to define variables that can later be used in your post, or in your templates.

## Templates

Templates are placed in the `templates` directory. The `templates` directory should contain subdirectories for each desired output (in my example I have `web`, `rss`, `gemini`).

The following two files from the subdirectory will be used:

- `index.*`: the file that will be used for content files that have `index` as basename. Meant as an index, listing pages/posts.
- `default.*`: the template that will be used for all other content files.

After building, the assembled files will be put in a `dist` directory. It also contains a subdirectory for every output.

### Global variables

Global variables can be defined in the optional `config.yaml` file. Variables defined here are available in posts and templates.

### Builtin variables

The following variables are exposed by default:

- `url`: the (relative) URL of the final resource.
- `content`: the plain CommonMark content.
- `content_rendered`: the HTML or gemtext rendered variant of the content.

In the case of an index, there is one more variable:

- `pages`: a variable that contains a list of pages. A page is an object that contains the frontmatter from the corresponding content file and the special variables listed above.

## Special variables

These variables have special behavoir, if specified:

- `path`: if specified in the front matter of a post, it will be used to generate the final URL. It is relative to the site root (aka the directory the site gets put in).

## Static files

All files placed in the static directory inside an output subdirectory will be copied over to the corresponding subdirectory in the `dist` directory.

## Renderers

Depending on the extension of the template, your content will be translated either to HTML (`.html` or `.xml`), gemtext (`.gmi`) or kept as-is (`.txt`, `.md`, and everything else).
