import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  appendSessionLog,
  buildContextContents,
  buildNodeContents,
  buildPathContents,
  loadNodes,
  normalizeConfig,
  parseCsv,
  pickNextNode,
  resolveContextPath,
  resolveNodePath,
  resolvePathIndexPath,
  saveNode,
  scheduleReview,
  slugify,
  unlockEligibleNodes,
  type ContextInput,
  type LearnConfig,
  type LearnConfigInput,
  type NodeInput,
  type PathInput,
} from "./learn.js";

const PLUGIN_ID = "clawd-plugin-loom";
const PLUGIN_NAME = "Clawdbot Loom";

const LEARNING_GUIDE = `# Loom Guide\n\nLoom is a local-first learning graph that blends mastery learning, spaced repetition, and retrieval practice.\n\n## Structure\n\n- paths/ -> one folder per learning path (e.g. nix, german)\n- nodes/ -> learning nodes grouped by path\n- contexts/ -> quick captures from real-life situations\n- sessions/ -> auto-logged review sessions\n- resources/ -> PDFs, links, datasets, or external assets\n\n## Files and Linking\n\n- Nodes and contexts are plain Markdown (.md).\n- Reference other nodes by id using wikilinks (e.g. [[nix/derivations]]) or standard markdown links.\n\n## What Is a Node?\n\nA node is the smallest unit of learning you want to master. Keep it narrow, testable, and self-contained.\n\nSuggested contents:\n- A short explanation in your own words\n- A concrete example or mini exercise\n- Links to prerequisite or follow-up nodes by id\n- A "check yourself" prompt (question or task)\n\n## Node Frontmatter\n\nRequired:\n- id\n- title\n- path\n- created\n- updated\n\nRecommended:\n- summary\n- type: concept | practice | project | checkpoint\n- status: locked | available | in-progress | mastered | paused\n- prerequisites: [node_id]\n- unlocks: [node_id]\n- familiarity: 0-5\n- srs_stage: 0+\n- last_reviewed\n- next_review\n- tags\n\n### Example Node\n\n---\nid: "nix/derivations"\ntitle: "Nix derivations"\nsummary: "Understand .drv files and build inputs"\npath: "nix"\ntype: "concept"\nstatus: "available"\nprerequisites:\n  - "nix/store-basics"\nunlocks:\n  - "nix/derivation-outputs"\nfamiliarity: 1\nsrs_stage: 0\nlast_reviewed: null\nnext_review: null\ncreated: "2026-01-03T12:00:00.000Z"\nupdated: "2026-01-03T12:00:00.000Z"\ntags:\n  - "nix"\n---\n\nBody starts here.\n\n## Context Captures\n\nContext notes are how you inject real-world situations into the graph. Use them to seed new nodes or link to existing ones.\n`;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `"'"'"`)}'`;
}

function execShell(command: string): string {
  return execSync(command, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: "/bin/bash",
  }).trim();
}

function commandExists(command: string): boolean {
  try {
    execShell(`command -v ${command}`);
    return true;
  } catch {
    return false;
  }
}

function ensureQmdInstalled(config: LearnConfig, logger: Console): void {
  if (commandExists("qmd")) return;

  if (!config.autoInstallQmd) {
    throw new Error("qmd is not installed and autoInstallQmd is disabled");
  }

  if (commandExists("bun")) {
    logger.info("Installing qmd via bun...");
    execShell("bun install -g https://github.com/tobi/qmd");
    return;
  }

  if (commandExists("npm")) {
    logger.info("Installing qmd via npm...");
    execShell("npm install -g https://github.com/tobi/qmd");
    return;
  }

  throw new Error("qmd is not installed and neither bun nor npm were found");
}

function runQmd(args: string[]): string {
  const command = ["qmd", ...args.map(shellQuote)].join(" ");
  return execShell(command);
}

function ensureLibraryDirectory(libraryPath: string): void {
  fs.mkdirSync(libraryPath, { recursive: true });
}

function ensureLearningGuide(libraryPath: string): void {
  const guidePath = path.join(libraryPath, "LOOM_GUIDE.md");
  if (!fs.existsSync(guidePath)) {
    fs.writeFileSync(guidePath, LEARNING_GUIDE, "utf-8");
  }
}

function initLibraryStructure(libraryPath: string): void {
  const folders = ["paths", "nodes", "contexts", "sessions", "resources"];
  folders.forEach((folder) => {
    fs.mkdirSync(path.join(libraryPath, folder), { recursive: true });
  });
}

function ensureCollection(config: LearnConfig): void {
  try {
    runQmd([
      "collection",
      "add",
      config.libraryPath,
      "--name",
      config.collectionName,
      "--mask",
      config.mask,
    ]);
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("exists")) return;
    throw error;
  }
}

function isGitRepo(libraryPath: string): boolean {
  try {
    execShell(`git -C ${shellQuote(libraryPath)} rev-parse --is-inside-work-tree`);
    return true;
  } catch {
    return false;
  }
}

function listGitRemotes(libraryPath: string): string[] {
  try {
    const output = execShell(`git -C ${shellQuote(libraryPath)} remote`);
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function looksLikeRemoteUrl(value: string): boolean {
  return value.includes("://") || value.endsWith(".git") || value.includes("@");
}

function ensureGitRepo(config: LearnConfig, logger: Console): boolean {
  if (isGitRepo(config.libraryPath)) return true;
  if (!config.gitRemote) return false;

  execShell(`git -C ${shellQuote(config.libraryPath)} init`);
  logger.info("Initialized git repository for loom library.");

  const remotes = listGitRemotes(config.libraryPath);
  if (looksLikeRemoteUrl(config.gitRemote)) {
    if (!remotes.includes("origin")) {
      execShell(
        `git -C ${shellQuote(config.libraryPath)} remote add origin ${shellQuote(config.gitRemote)}`
      );
      logger.info("Added origin remote for loom library.");
    }
  }

  return true;
}

function resolveGitRemote(config: LearnConfig): string | null {
  const remotes = listGitRemotes(config.libraryPath);
  if (config.gitRemote && remotes.includes(config.gitRemote)) {
    return config.gitRemote;
  }

  if (config.gitRemote && looksLikeRemoteUrl(config.gitRemote)) {
    if (remotes.includes("origin")) return "origin";
    return null;
  }

  if (remotes.includes("origin")) return "origin";
  return remotes[0] || null;
}

function gitPull(config: LearnConfig): void {
  const remote = resolveGitRemote(config);
  if (!remote) return;
  execShell(
    `git -C ${shellQuote(config.libraryPath)} pull --rebase ${shellQuote(remote)} ${shellQuote(config.gitBranch)}`
  );
}

function gitHasChanges(config: LearnConfig): boolean {
  const output = execShell(
    `git -C ${shellQuote(config.libraryPath)} status --porcelain`
  );
  return output.length > 0;
}

function gitCommit(config: LearnConfig, message: string): void {
  execShell(`git -C ${shellQuote(config.libraryPath)} add -A`);
  try {
    execShell(
      `git -C ${shellQuote(config.libraryPath)} commit -m ${shellQuote(message)}`
    );
  } catch (error: any) {
    const messageText = String(error?.message || "");
    if (messageText.includes("nothing to commit")) return;
    throw error;
  }
}

function gitPush(config: LearnConfig): void {
  const remote = resolveGitRemote(config);
  if (!remote) return;
  execShell(
    `git -C ${shellQuote(config.libraryPath)} push ${shellQuote(remote)} ${shellQuote(config.gitBranch)}`
  );
}

function syncBefore(config: LearnConfig, logger: Console): void {
  if (!config.gitSync) return;
  if (!ensureGitRepo(config, logger)) return;
  gitPull(config);
}

function syncAfter(config: LearnConfig, logger: Console, message: string): void {
  if (!config.gitSync) return;
  if (!ensureGitRepo(config, logger)) return;

  if (!gitHasChanges(config)) return;

  if (config.gitAutoCommit) {
    gitCommit(config, message);
  }

  gitPush(config);
}

function updateIndex(): void {
  runQmd(["update"]);
}

function embedIndex(force?: boolean): void {
  const args = ["embed"];
  if (force) args.push("-f");
  runQmd(args);
}

function queryLibrary(
  config: LearnConfig,
  query: string,
  mode: "search" | "vsearch" | "query",
  options: { limit?: number; minScore?: number; json?: boolean }
): any {
  const args = [mode, query, "-c", config.collectionName];
  if (options.limit) {
    args.push("-n", String(options.limit));
  }
  if (options.minScore !== undefined) {
    args.push("--min-score", String(options.minScore));
  }
  if (options.json !== false) {
    args.push("--json");
  }

  const output = runQmd(args);
  if (options.json === false) return output;

  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}

function readConfig(api: any): LearnConfig {
  const entries = api?.config?.plugins?.entries || {};
  const entryConfig =
    entries[PLUGIN_ID]?.config ||
    entries.loom?.config ||
    entries[PLUGIN_NAME]?.config;

  const config: LearnConfigInput = {
    ...(entryConfig || {}),
  };

  if (!config.libraryPath && process.env.LEARN_PATH) {
    config.libraryPath = process.env.LEARN_PATH;
  }

  return normalizeConfig(config);
}

function createLogger(api: any): Console {
  return api?.logger || console;
}

function addPath(config: LearnConfig, input: PathInput, logger: Console): string {
  ensureLibraryDirectory(config.libraryPath);
  initLibraryStructure(config.libraryPath);
  ensureLearningGuide(config.libraryPath);

  syncBefore(config, logger);

  const pathSlug = slugify(input.title);
  const indexPath = resolvePathIndexPath(config.libraryPath, pathSlug);
  if (fs.existsSync(indexPath)) {
    throw new Error(`Path already exists at ${pathSlug}`);
  }

  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, buildPathContents(input), "utf-8");

  updateIndex();
  syncAfter(config, logger, `loom: add path ${pathSlug}`);

  return pathSlug;
}

function addNode(config: LearnConfig, input: NodeInput, logger: Console): string {
  ensureLibraryDirectory(config.libraryPath);
  initLibraryStructure(config.libraryPath);
  ensureLearningGuide(config.libraryPath);

  syncBefore(config, logger);

  const pathSlug = input.path ? slugify(input.path) : "general";
  const nodeSlug = slugify(input.title);
  const resolved = input.relativePath
    ? {
        fullPath: path.join(config.libraryPath, input.relativePath),
        relativePath: input.relativePath,
      }
    : resolveNodePath(config.libraryPath, pathSlug, nodeSlug);

  if (!input.overwrite && fs.existsSync(resolved.fullPath)) {
    throw new Error(`Node already exists at ${resolved.relativePath}`);
  }

  fs.mkdirSync(path.dirname(resolved.fullPath), { recursive: true });
  fs.writeFileSync(resolved.fullPath, buildNodeContents(input), "utf-8");

  updateIndex();
  syncAfter(config, logger, `loom: add node ${resolved.relativePath}`);

  return resolved.relativePath;
}

function captureContext(config: LearnConfig, input: ContextInput, logger: Console): string {
  ensureLibraryDirectory(config.libraryPath);
  initLibraryStructure(config.libraryPath);
  ensureLearningGuide(config.libraryPath);

  syncBefore(config, logger);

  const resolved = resolveContextPath(config.libraryPath, input.title);
  if (fs.existsSync(resolved.fullPath)) {
    throw new Error(`Context already exists at ${resolved.relativePath}`);
  }

  fs.mkdirSync(path.dirname(resolved.fullPath), { recursive: true });
  fs.writeFileSync(resolved.fullPath, buildContextContents(input), "utf-8");

  updateIndex();
  syncAfter(config, logger, `loom: capture ${resolved.relativePath}`);

  return resolved.relativePath;
}

function unlockNodes(config: LearnConfig, logger: Console): string[] {
  syncBefore(config, logger);
  const records = loadNodes(config.libraryPath);
  const unlocked = unlockEligibleNodes(records, config.masteryThreshold);
  unlocked.forEach((record) => saveNode(record, record.node));

  if (unlocked.length > 0) {
    appendSessionLog(config.libraryPath, `Unlocked ${unlocked.length} node(s)`);
    updateIndex();
    syncAfter(config, logger, `loom: unlock ${unlocked.length} nodes`);
  }

  return unlocked.map((record) => record.node.id);
}

function pickNode(config: LearnConfig, logger: Console, start: boolean): any {
  syncBefore(config, logger);
  const records = loadNodes(config.libraryPath);
  const unlocked = unlockEligibleNodes(records, config.masteryThreshold);
  unlocked.forEach((record) => saveNode(record, record.node));
  let changed = unlocked.length > 0;

  const result = pickNextNode(records);

  if (result.node && start) {
    const record = records.find((item) => item.node.id === result.node?.id);
    if (record && record.node.status === "available") {
      record.node.status = "in-progress";
      saveNode(record, record.node);
      changed = true;
    }
  }

  if (changed) {
    updateIndex();
    syncAfter(config, logger, `loom: update ${unlocked.length} nodes`);
  }

  return {
    node: result.node,
    reason: result.reason,
    unlocked: unlocked.map((record) => record.node.id),
  };
}

function reviewNode(
  config: LearnConfig,
  logger: Console,
  params: { id: string; rating: "again" | "hard" | "good" | "easy" }
): any {
  syncBefore(config, logger);
  const records = loadNodes(config.libraryPath);
  const record = records.find((item) => item.node.id === params.id);
  if (!record) {
    throw new Error(`Node ${params.id} not found`);
  }

  const updated = scheduleReview(
    record.node,
    params.rating,
    config.srsIntervals,
    config.masteryThreshold
  );

  saveNode(record, updated);
  appendSessionLog(
    config.libraryPath,
    `Reviewed ${updated.id} (${params.rating}) -> stage ${updated.srsStage}`
  );

  updateIndex();
  syncAfter(config, logger, `loom: review ${updated.id}`);

  return updated;
}

function graphSummary(config: LearnConfig, logger: Console): any {
  syncBefore(config, logger);
  const records = loadNodes(config.libraryPath);
  return records.map((record) => ({
    id: record.node.id,
    title: record.node.title,
    path: record.node.path,
    status: record.node.status,
    familiarity: record.node.familiarity,
    prerequisites: record.node.prerequisites,
    unlocks: record.node.unlocks,
    nextReview: record.node.nextReview,
  }));
}

export default {
  id: PLUGIN_ID,
  name: PLUGIN_NAME,
  configSchema: {
    parse: (value: unknown) => value as LearnConfigInput,
    uiHints: {
      libraryPath: { label: "Loom Library Path", placeholder: "/Users/you/Loom" },
      collectionName: { label: "QMD Collection Name", placeholder: "learn" },
      gitRemote: { label: "Git Remote", placeholder: "origin" },
      gitBranch: { label: "Git Branch", placeholder: "main" },
      gitSync: { label: "Git Sync", description: "Pull before and push after changes." },
      gitAutoCommit: { label: "Git Auto Commit" },
      autoInstallQmd: { label: "Auto Install QMD" },
      mask: { label: "File Mask", placeholder: "**/*.md" },
      masteryThreshold: { label: "Mastery Threshold", placeholder: "4" },
    },
  },
  register(api: any) {
    const logger = createLogger(api);
    const config = readConfig(api);

    ensureLibraryDirectory(config.libraryPath);
    initLibraryStructure(config.libraryPath);
    ensureLearningGuide(config.libraryPath);
    ensureQmdInstalled(config, logger);
    ensureCollection(config);

    api.registerCli(
      ({ program }: any) => {
        const learn = program.command("learn").description("Learning graph management");

        learn
          .command("init")
          .description("Initialize loom folders and guide")
          .action(() => {
            ensureLibraryDirectory(config.libraryPath);
            initLibraryStructure(config.libraryPath);
            ensureLearningGuide(config.libraryPath);
            console.log(`Loom initialized at ${config.libraryPath}`);
          });

        learn
          .command("path <title>")
          .option("-s, --summary <summary>", "One-line summary")
          .option("-t, --tags <tags>", "Comma-separated tags")
          .option("-S, --status <status>", "Path status")
          .description("Create a learning path")
          .action((title: string, options: any) => {
            const pathSlug = addPath(
              config,
              {
                title,
                summary: options.summary,
                tags: parseCsv(options.tags),
                status: options.status,
              },
              logger
            );
            console.log(`Added path ${pathSlug}`);
          });

        learn
          .command("node <title> [content...]")
          .option("-p, --path <path>", "Learning path slug")
          .option("-s, --summary <summary>", "One-line summary")
          .option("-t, --tags <tags>", "Comma-separated tags")
          .option("--type <type>", "Node type (concept|practice|project|checkpoint)")
          .option("--prereq <ids>", "Comma-separated prerequisites")
          .option("--unlocks <ids>", "Comma-separated unlocks")
          .option("--status <status>", "Node status")
          .option("--overwrite", "Overwrite existing node", false)
          .description("Add a learning node")
          .action((title: string, contentParts: string[], options: any) => {
            const body = contentParts.join(" ").trim();
            if (!body) {
              throw new Error("Node body is required");
            }

            const relativePath = addNode(
              config,
              {
                title,
                body,
                summary: options.summary,
                path: options.path,
                type: options.type,
                status: options.status,
                tags: parseCsv(options.tags),
                prerequisites: parseCsv(options.prereq),
                unlocks: parseCsv(options.unlocks),
                overwrite: options.overwrite,
              },
              logger
            );

            console.log(`Saved ${relativePath}`);
          });

        learn
          .command("capture <title> [content...]")
          .option("-p, --path <path>", "Learning path slug")
          .option("-n, --node <node>", "Related node id")
          .option("-t, --tags <tags>", "Comma-separated tags")
          .description("Capture a real-world context or situation")
          .action((title: string, contentParts: string[], options: any) => {
            const body = contentParts.join(" ").trim();
            if (!body) {
              throw new Error("Context body is required");
            }

            const relativePath = captureContext(
              config,
              {
                title,
                body,
                path: options.path,
                node: options.node,
                tags: parseCsv(options.tags),
              },
              logger
            );

            console.log(`Captured ${relativePath}`);
          });

        learn
          .command("unlock")
          .description("Unlock nodes whose prerequisites are met")
          .action(() => {
            const unlocked = unlockNodes(config, logger);
            if (unlocked.length === 0) {
              console.log("No nodes unlocked");
              return;
            }
            console.log(`Unlocked ${unlocked.length} node(s)`);
            unlocked.forEach((id) => console.log(`- ${id}`));
          });

        learn
          .command("next")
          .option("--start", "Mark node as in-progress", false)
          .description("Suggest the next node to study")
          .action((options: any) => {
            const result = pickNode(config, logger, options.start);
            if (!result.node) {
              console.log("No available nodes found");
              return;
            }

            console.log(`${result.node.title} (${result.node.id})`);
            if (result.reason) {
              console.log(`Reason: ${result.reason}`);
            }
            if (result.unlocked.length > 0) {
              console.log(`Unlocked: ${result.unlocked.join(", ")}`);
            }
          });

        learn
          .command("review <id>")
          .option("-r, --rating <rating>", "again | hard | good | easy", "good")
          .description("Review a node and schedule the next repetition")
          .action((id: string, options: any) => {
            const rating = options.rating as "again" | "hard" | "good" | "easy";
            const updated = reviewNode(config, logger, { id, rating });
            console.log(
              `Reviewed ${updated.id} -> next ${updated.nextReview} (stage ${updated.srsStage})`
            );
          });

        learn
          .command("graph")
          .option("--json", "Output JSON", false)
          .description("Show the learning graph summary")
          .action((options: any) => {
            const summary = graphSummary(config, logger);
            if (options.json) {
              console.log(JSON.stringify(summary, null, 2));
              return;
            }

            summary.forEach((node: { id: string; status: string; title: string }) => {
              console.log(`${node.id} [${node.status}] -> ${node.title}`);
            });
          });

        learn
          .command("query <query>")
          .option("-m, --mode <mode>", "search | vsearch | query", "query")
          .option("-n, --limit <limit>", "Limit results", "5")
          .option("--min-score <score>", "Minimum score", "0")
          .description("Query the loom library with qmd")
          .action((query: string, options: any) => {
            syncBefore(config, logger);
            const mode = options.mode as "search" | "vsearch" | "query";
            const limit = parseInt(options.limit, 10);
            const minScore = parseFloat(options.minScore);
            const results = queryLibrary(config, query, mode, {
              limit,
              minScore,
              json: false,
            });
            console.log(results);
          });

        learn
          .command("index")
          .option("-e, --embed", "Run qmd embed")
          .description("Refresh qmd index for the loom library")
          .action((options: any) => {
            syncBefore(config, logger);
            updateIndex();
            if (options.embed) {
              embedIndex();
            }
            console.log("Loom index updated");
          });

        learn
          .command("embed")
          .option("-f, --force", "Force re-embed")
          .description("Generate embeddings for the loom library")
          .action((options: any) => {
            syncBefore(config, logger);
            embedIndex(options.force);
            console.log("Embeddings generated");
          });
      },
      { commands: ["learn"] }
    );

    api.registerTool({
      name: "learn_add_node",
      description: "Create a learning node with structured frontmatter.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          summary: { type: "string" },
          path: { type: "string" },
          type: { type: "string" },
          status: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          prerequisites: { type: "array", items: { type: "string" } },
          unlocks: { type: "array", items: { type: "string" } },
          relativePath: { type: "string" },
          overwrite: { type: "boolean" },
        },
        required: ["title", "body"],
      },
      async execute(_id: string, params: NodeInput) {
        const relativePath = addNode(config, params, logger);
        return {
          content: [
            {
              type: "text",
              text: `Saved ${relativePath}`,
            },
          ],
        };
      },
    });

    api.registerTool({
      name: "learn_capture",
      description: "Capture a contextual learning situation.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          path: { type: "string" },
          node: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["title", "body"],
      },
      async execute(_id: string, params: ContextInput) {
        const relativePath = captureContext(config, params, logger);
        return {
          content: [
            {
              type: "text",
              text: `Captured ${relativePath}`,
            },
          ],
        };
      },
    });

    api.registerTool({
      name: "learn_next",
      description: "Suggest the next node to study.",
      parameters: {
        type: "object",
        properties: {
          start: { type: "boolean" },
        },
      },
      async execute(_id: string, params: any) {
        const result = pickNode(config, logger, Boolean(params?.start));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    });

    api.registerTool({
      name: "learn_review",
      description: "Review a node and schedule the next repetition.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          rating: { type: "string", enum: ["again", "hard", "good", "easy"] },
        },
        required: ["id", "rating"],
      },
      async execute(_id: string, params: any) {
        const updated = reviewNode(config, logger, {
          id: params.id,
          rating: params.rating,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(updated, null, 2),
            },
          ],
        };
      },
    });

    api.registerTool({
      name: "learn_query",
      description: "Query the loom library using qmd search, vsearch, or query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          mode: { type: "string", enum: ["search", "vsearch", "query"] },
          limit: { type: "number" },
          minScore: { type: "number" },
        },
        required: ["query"],
      },
      async execute(_id: string, params: any) {
        syncBefore(config, logger);
        const results = queryLibrary(config, params.query, params.mode || "query", {
          limit: params.limit,
          minScore: params.minScore,
          json: true,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      },
    });

    api.registerGatewayMethod("learn.next", async (params: any) => {
      return pickNode(config, logger, Boolean(params?.start));
    });

    api.registerGatewayMethod("learn.review", async (params: any) => {
      return reviewNode(config, logger, {
        id: params.id,
        rating: params.rating,
      });
    });

    api.registerGatewayMethod("learn.capture", async (params: ContextInput) => {
      return { path: captureContext(config, params, logger) };
    });

    api.registerGatewayMethod("learn.add", async (params: NodeInput) => {
      return { path: addNode(config, params, logger) };
    });

    api.registerGatewayMethod("learn.query", async (params: any) => {
      return queryLibrary(config, params.query, params.mode || "query", {
        limit: params.limit,
        minScore: params.minScore,
        json: true,
      });
    });

    api.registerGatewayMethod("learn.graph", async () => {
      return graphSummary(config, logger);
    });
  },
};
