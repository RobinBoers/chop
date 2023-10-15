#!/usr/bin/env -S bun run

const { Liquid } = await import("liquidjs");
const yaml = await import("js-yaml");
const path = await import("node:path");
const { md2gemini, md2html } = await import("./renderers");

// MAGIC!!

async function $(base, ...interpolated) {
  const command = base.reduce(
    (acc, str, i) => acc + str + (interpolated[i] || ""),
    ""
  );

  const proc = Bun.spawn(command.split(" "));
  const response = await new Response(proc.stdout).text();

  let output = response.trim().split("\n");

  if (output.length <= 1) return output[0];
  return output;
}

// Configuration

const currentDirectory = await $`pwd`;
const CONFIG_FILE = `${currentDirectory}/config.yaml`;
const TEMPLATES_DIR = `${currentDirectory}/templates`;
const DESTINATION_DIR = `${currentDirectory}/dist`;
const EXT = ".txt";

const availableOutputs = await $`ls ${TEMPLATES_DIR}`;
const globalVariables = await parseConfigFile();

console.log(`Using outputs: ${availableOutputs.join(", ")}`);

const filePathsToProcess = await listContentFiles();
const contentFiles = await Promise.all(filePathsToProcess.map(prepareFile));

for (const output of availableOutputs) {
  await cleanOutput(output);

  const templatesDirectory = `${TEMPLATES_DIR}/${output}`;
  const destinationDirectory = `${DESTINATION_DIR}/${output}`;
  const templates = await getTemplates();
  const templateEngine = new Liquid({ root: templatesDirectory });

  let pages = [];

  await renderPages();
  await renderIndexes();

  async function renderPages() {
    let template = await getTemplate("default");

    listPages().forEach(({ filePath, variables }) => {
      variables.url = generateURL(template, filePath, variables);
      variables.content_rendered = renderContent(template, variables.content);
      pages.push(variables);
      renderTemplate(template, variables);
    });

    return;
  }

  async function renderIndexes() {
    let template = await getTemplate("index");

    listIndexes().forEach(({ filePath, variables }) => {
      variables.url = generateURL(template, filePath, variables);
      variables.content_rendered = renderContent(template, variables.content);
      variables.pages = pages;
      renderTemplate(template, variables);
    });

    return;
  }

  function generateURL(template, filePath, variables) {
    let relativePath = path.relative(currentDirectory, filePath);
    let generatedPath = "/" + path.join(path.dirname(relativePath), path.basename(relativePath, EXT))

    let finalPath = variables.path || generatedPath;
    let templateExtension = path.extname(template.path) || ".html";

    return `${finalPath}${templateExtension}`;
  }

  function renderContent(template, sourceContent) {
    switch (path.extname(template.path) || ".html") {
      case ".html":
      case ".xml":
        return md2html(sourceContent);

      case ".gmi":
        return md2gemini(sourceContent);

      case ".txt":
      case ".md":
      default:
        return sourceContent;
    }
  }

  function renderTemplate(template, variables) {
    if (template.parsed) {
      templateEngine.render(template.parsed, variables).then((rendered) => {
        let finalPath = `${destinationDirectory}${variables.url}`;
        console.log(`Writing template '${template.path}' to '${finalPath}'`);

        // This runs in async. We're not doing anything with the result,
        // so that's why there's not await.
        writeFileAndCreatePath(finalPath, rendered);
      });
    }
  }

  async function getTemplates() {
    const templates = await $`find ${templatesDirectory}`;
  
    if (templates == "") return [];
    return templates;
  }

  async function getTemplate(name) {
    const templatePath = templates.find(
      (template) => path.basename(template, path.extname(template)) == name
    );

    if (!templatePath) return {};

    const content = await readFile(templatePath);
    const parsed = templateEngine.parse(content);

    return { path: templatePath, parsed: parsed };
  }
}

// Files

async function listContentFiles() {
  // This monstrosity recursively lists all files in the current directory ending with the configured extensions,
  // but skips the config file and templates directory.
  let paths = await $`find ${currentDirectory} -type d ( -name ${path.basename(
    TEMPLATES_DIR
  )} -o -name ${path.basename(DESTINATION_DIR)} )  -prune -o -type f -name *${EXT} ! -name ${path.basename(
    CONFIG_FILE
  )} -print`;

  if (paths == "") return [];
  return paths;
}

async function prepareFile(filePath) {
  const frontmatterVariables = await parseFrontmatterVariables(filePath);

  let variables = { ...globalVariables, ...frontmatterVariables };
  return { filePath, variables };
}

function listPages() {
  return contentFiles.filter(({ filePath, variables }) => !isIndex(filePath));
}

function listIndexes() {
  return contentFiles.filter(({ filePath, variables }) => isIndex(filePath));
}

function isIndex(filePath) {
  return path.basename(filePath, EXT) == "index";
}

// Parsing

async function parseConfigFile() {
  try {
    const config = await readFile(CONFIG_FILE);
    return yaml.load(config);
  } catch {
    return {}
  }
}

async function parseFrontmatterVariables(filePath) {
  const documentContent = await readFile(filePath);

  const [empty, frontmatter, content] = documentContent.split("---");

  if (empty != "")
    throw `Error: failed to parse '${filePath}', invalid frontmatter.`;

  let frontmatterVariables = yaml.load(frontmatter);
  frontmatterVariables.content = content.trim();

  return frontmatterVariables;
}

// Outputs

async function cleanOutput(output) {
  await $`rm -rf ${DESTINATION_DIR}/${output}`;
  await $`mkdir -p ${DESTINATION_DIR}/${output}`;
}

// Helpers

async function readFile(path) {
  const file = Bun.file(path);
  return await file.text();
}

async function writeFileAndCreatePath(filePath, content) {
  await $`mkdir -p ${path.dirname(filePath)}`;

  Bun.write(filePath, content).catch((e) => {
    throw `Writing '${filePath}' failed with '${e}' :(`;
  });
}
