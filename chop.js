#!/usr/bin/env -S bun run

const { Liquid } = await import("liquidjs");
const yaml = await import("js-yaml");
const { smartypants, smartypantsu } = await import("smartypants");
const fs = await import("node:fs");
const path = await import("node:path");
const { md2gemtext, md2html, md2txt } = await import("./renderers");

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
const CACHE_DIR = `${PWD}/.cache`;
const EXT = ".txt";

if(!fs.existsSync(CACHE_DIR)) await $`mkdir ${CACHE_DIR}`;

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

  return await listDirectory(PWD, `-type d ( -name ${path.basename(TEMPLATES_DIR)} -o -name ${path.basename(DESTINATION_DIR)} -o -name ${path.basename(CACHE_DIR)} ) -prune -o -type f -name *${EXT} ! -name ${path.basename(CONFIG_FILE)} -print`);  
}

async function builtOutput(output) {
  await cleanOutput(output);

  console.log(`\n==> Building ${output}`)

  const templatesDirectory = `${TEMPLATES_DIR}/${output}`;
  const destinationDirectory = `${DESTINATION_DIR}/${output}`;
  const templateEngine = new Liquid({ root: templatesDirectory });

  let pages = [];

  let defaultTemplatePath = await getTemplatePath(templatesDirectory, "default");
  let defaultParsedTemplate = await parseTemplate(templateEngine, defaultTemplatePath);

  await listPages().forEach(async variables => {
    variables = await processContent(variables, defaultTemplatePath)
    pages.push(variables);

    render(templateEngine, defaultTemplatePath, defaultParsedTemplate, variables, destinationDirectory);
  });

  // Try to load index template. 
  // If it doesn't exist, fall back to the default template.
  let indexTemplatePath = (await getTemplatePath(templatesDirectory, "index")) || defaultTemplatePath;
  let indexParsedTemplate = await parseTemplate(templateEngine, indexTemplatePath);

  await listIndexes().forEach(async variables => {
    variables = await processContent(variables, indexTemplatePath);
    variables.pages = pages;

    render(templateEngine, indexTemplatePath, indexParsedTemplate, variables, destinationDirectory);
  });

  // This is async, but because I don't do anything with the output, I don't await it.
  copyStaticFiles(templatesDirectory, destinationDirectory);
  copyStaticFiles(PWD, destinationDirectory);
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
  return `${variables.site.prefix || ""}${path}`;
}

async function processContent(variables, templatePath) {
  const {converter: convert, educater: educate} = processorsForTemplate(templatePath);

  const convertedContent = await convert(variables.content, { 
    linkPrefix: variables.site.prefix || "" 
  });

  let renderedContent = convertedContent;

  if(templatePath) {
    const templateEngine = new Liquid({ 
      root: path.dirname(templatePath), 
      extname: path.extname(templatePath)
    });

    const contentTemplate = await templateEngine.parse(convertedContent);
    renderedContent = await templateEngine.render(contentTemplate, variables);
  }

  return { 
    ...variables, 
    content: educate(variables.content),
    content_rendered: educate(renderedContent)
  };
}

function processorsForTemplate(templatePath) {
  switch (path.extname(templatePath) || ".html") {
    case ".html":
    case ".xml":
      return {
        converter: md2html,
        educater: (source) => smartypants(source, "qde")
      };

    case ".gmi":
      return {
        converter: md2gemtext,
        educater: (source) => smartypantsu(source, "de")
      };

    case ".txt":
    default:
      return {
        converter: md2txt,
        educater: (source) => smartypantsu(source, "qde")
      };
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
      console.log(`Writing ${variables.path_unprefixed}`);

      // This runs in async. We're not doing anything with the result,
      // so that's why there's not await.
      writeFileAndCreatePath(finalPath, rendered);
    });
  }
}

async function copyStaticFiles(baseDirectory, destinationDirectory) {
  const staticDirectory = `${baseDirectory}/static`;

  if (fs.existsSync(staticDirectory)) {
    let staticFiles = await listDirectory(staticDirectory);

    staticFiles.forEach((filePath) => {
      const relativeSourcePath = path.relative(staticDirectory, filePath);
      const cachedPath = `${CACHE_DIR}/${path.basename(relativeSourcePath)}`; 
      const destinationPath = `${destinationDirectory}/${relativeSourcePath}`

      copyStaticFile(filePath, destinationPath, cachedPath);
    });
  }
}

async function copyStaticFile(originalPath, destinationPath, cachedPath) {
  if(originalPath.endsWith(".js")) await minifyJS(originalPath, cachedPath);
  else if(originalPath.endsWith(".css")) await minifyCSS(originalPath, cachedPath);
  else if(originalPath.endsWith(".png")) await optimizePNG(originalPath, cachedPath);
  else if(originalPath.endsWith(".jpg")) await optimizeJPG(originalPath, cachedPath);
  else if(originalPath.endsWith(".svg")) await optimizeSVG(originalPath, cachedPath);
  else await $`cp ${originalPath} ${cachedPath}`;

  await $`mkdir -p ${path.dirname(destinationPath)}`;
  await $`cp ${cachedPath} ${destinationPath}`;
}

async function optimizePNG(originalPath, cachedPath) {
  if(fs.existsSync(cachedPath)) return;

  await scaleImageDown(originalPath, cachedPath);
  await $`optipng -quiet -o7 -clobber ${cachedPath} -out ${cachedPath}.optipng`;
  await $`pngcrush -s -reduce -brute ${cachedPath}.optipng ${cachedPath}`;
}

async function optimizeJPG(originalPath, cachedPath) {
  if(fs.existsSync(cachedPath)) return;

  await scaleImageDown(originalPath, cachedPath);
  await $`jpegoptim --quiet --strip-all ${cachedPath}`;
}

async function scaleImageDown(originalPath, cachedPath) {
  await $`convert ${originalPath} -resize 600x> ${cachedPath}`;
}

async function optimizeSVG(originalPath, cachedPath) {
  if(fs.existsSync(cachedPath)) return;
  
  await $`svgo --quiet --multipass -i ${originalPath} -o ${cachedPath}`;
}

async function minifyJS(originalPath, cachedPath) {
  await $`terser --compress --mangle -- ${originalPath} > ${cachedPath}`;
}

async function minifyCSS(originalPath, cachedPath) {
  await $`minify ${originalPath} --output ${cachedPath}`;
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
  const documentContent = (await readFile(filePath)).split("---");

  const [empty, frontmatter] = documentContent;

  if (empty != "")
    throw `Error: failed to parse '${filePath}', invalid frontmatter.`;

  const content = documentContent.slice(2).join("---").trim();
  let frontmatterVariables = yaml.load(frontmatter);
  
  return { ...frontmatterVariables, content: content };
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