#!/usr/bin/env -S bun run

const { Liquid } = await import("liquidjs");
const yaml = await import("js-yaml");
const fs = await import("node:fs");
const path = await import("node:path");
const { md2gemini, md2html } = await import("./renderers");

// MAGIC!!

async function $(base, ...interpolated) {
  const command = base.reduce((acc, str, i) => acc + str + (interpolated[i] || ""), "");

  const proc = Bun.spawn(command.split(" "));
  const response = await new Response(proc.stdout).text();

  let output = response.trim().split("\n");

  if (output.length <= 1) return output[0];
  return output;
}

// Configuration

const PWD = await $`pwd`;
const CONFIG_FILE = `${PWD}/config.yaml`;
const TEMPLATES_DIR = `${PWD}/templates`;
const DESTINATION_DIR = `${PWD}/dist`;
const EXT = ".txt";

const availableOutputs = await $`ls ${TEMPLATES_DIR}`;
const globalVariables = await parseConfigFile();

console.log(`Using outputs: ${availableOutputs.join(", ")}`);

const filePathsToProcess = await listContentFiles();
const contentFiles = await Promise.all(filePathsToProcess.map(frontmatter));

for (const output of availableOutputs) {
  await builtOutput(output);
}

async function listContentFiles() {
  // This monstrosity recursively lists all files in the current directory 
  // ending with the configured extension for content,
  // but skips the config file and templates/dist directories.

  return await listDirectory(PWD, `-type d ( -name ${path.basename(TEMPLATES_DIR)} -o -name ${path.basename(DESTINATION_DIR)} ) -prune -o -type f -name *${EXT} ! -name ${path.basename(CONFIG_FILE)} -print`);  
}

async function builtOutput(output) {
  await cleanOutput(output);

  const templatesDirectory = `${TEMPLATES_DIR}/${output}`;
  const destinationDirectory = `${DESTINATION_DIR}/${output}`;
  const templateEngine = new Liquid({ root: templatesDirectory });

  let pages = [];

  let defaultTemplatePath = await getTemplatePath(templatesDirectory, "default");
  let defaultParsedTemplate = await parseTemplate(templateEngine, defaultTemplatePath);

  listPages().forEach(variables => {
    variables = parse(variables, defaultTemplatePath)
    pages.push(variables);

    render(templateEngine, defaultTemplatePath, defaultParsedTemplate, variables, destinationDirectory);
  });

  // Try to load index template. 
  // If it doesn't exist, fall back to the default template.
  let indexTemplatePath = (await getTemplatePath(templatesDirectory, "index")) || defaultTemplatePath;
  let indexParsedTemplate = await parseTemplate(templateEngine, indexTemplatePath);

  listIndexes().forEach(variables => {
    variables = parse(variables, indexTemplatePath);
    variables.pages = pages;

    render(templateEngine, indexTemplatePath, indexParsedTemplate, variables, destinationDirectory);
  });

  // This is async, but because I don't do anything with the output, I don't await it.
  copyStaticFiles(templatesDirectory, destinationDirectory);
}

// Render pipeline

async function frontmatter(filePath) {
  const frontmatterVariables = await parseFrontmatterVariables(filePath);
  const path = generatePath(filePath, frontmatterVariables);

  let variables = { 
    ...globalVariables, 
    ...frontmatterVariables, 
    path: prefixPath(path, globalVariables), 
    path_unprefixed: path,
  };

  return variables;
}

function generatePath(filePath, variables) {
  let relativePath = path.relative(PWD, filePath);
  let generatedPath = `/${path.join(path.dirname(relativePath), path.basename(relativePath, EXT))}`;

  return variables.path || generatedPath;
}

function prefixPath(path, variables) {
  return `${variables.site_prefix || ""}${path}`;
}

function parse(variables, defaultTemplatePath) {
  variables.content_rendered = renderContent(defaultTemplatePath, variables.content);
  return variables;
}

function renderContent(templatePath, sourceContent) {
  switch (path.extname(templatePath) || ".html") {
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

function render(
  templateEngine,
  templatePath,
  parsedTemplate,
  variables,
  destinationDirectory
) {
  if (parsedTemplate) {
    templateEngine.render(parsedTemplate, variables).then((rendered) => {
      const templateExtension = path.extname(templatePath);
      let finalPath = `${destinationDirectory}${variables.path_unprefixed}${templateExtension}`;
      console.log(`Writing template '${templatePath}' to '${finalPath}'`);

      // This runs in async. We're not doing anything with the result,
      // so that's why there's not await.
      writeFileAndCreatePath(finalPath, rendered);
    });
  }
}

function copyStaticFiles(templatesDirectory, destinationDirectory) {
  const staticFiles = `${templatesDirectory}/static`;
  if (fs.existsSync(staticFiles)) $`cp -r ${staticFiles}/. ${destinationDirectory}`;  
}

// Content files

function listPages() {
  return contentFiles.filter(variables => !isIndex(variables.path));
}

function listIndexes() {
  return contentFiles.filter(variables => isIndex(variables.path));
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
    return {};
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

async function getTemplatePath(templatesDirectory, templateName) {
  const templates = await listDirectory(templatesDirectory);
  const templatePath = templates.find((template) => path.basename(template, path.extname(template)) == templateName);

  return templatePath;
}

async function parseTemplate(templateEngine, templatePath) {
  // If the template doesn't exist, we don't render a template.
  // Therefore, we return nothing here and then later check if
  // parsedTemplate exists.
  if(templatePath) {
    const content = await readFile(templatePath);
    return templateEngine.parse(content);
  }
}

// File system

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

async function listDirectory(directory, args) {
  let paths = await $`find ${directory} ${args} -type f`;

  if (paths == "") return [];
  if (typeof paths == "string") return [paths];
  return paths;
}