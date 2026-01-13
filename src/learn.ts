import fs from "fs";
import path from "path";
import matter from "gray-matter";
import yaml from "yaml";

const NODE_EXTENSIONS = new Set([".md", ".qmd"]);
const DEFAULT_SRS_INTERVALS = [1, 3, 7, 14, 30, 60, 120, 240];

const YAML_ENGINE = {
  parse: (value: string) => yaml.parse(value),
  stringify: (data: unknown) => yaml.stringify(data, { lineWidth: 0 }),
};

const MATTER_OPTIONS = { engines: { yaml: YAML_ENGINE }, language: "yaml" };

export type LearnConfigInput = {
  libraryPath?: string;
  collectionName?: string;
  gitRemote?: string;
  gitBranch?: string;
  gitSync?: boolean;
  gitAutoCommit?: boolean;
  autoInstallQmd?: boolean;
  mask?: string;
  masteryThreshold?: number;
  srsIntervals?: number[];
};

export type LearnConfig = {
  libraryPath: string;
  collectionName: string;
  gitRemote?: string;
  gitBranch: string;
  gitSync: boolean;
  gitAutoCommit: boolean;
  autoInstallQmd: boolean;
  mask: string;
  masteryThreshold: number;
  srsIntervals: number[];
};

export type NodeInput = {
  title: string;
  body: string;
  summary?: string;
  path?: string;
  type?: string;
  status?: string;
  tags?: string[];
  prerequisites?: string[];
  unlocks?: string[];
  relativePath?: string;
  id?: string;
  overwrite?: boolean;
};

export type PathInput = {
  title: string;
  summary?: string;
  tags?: string[];
  status?: string;
};

export type ContextInput = {
  title: string;
  body: string;
  path?: string;
  node?: string;
  tags?: string[];
  sources?: Array<{ title: string; url: string }>;
};

export type LearnNode = {
  id: string;
  title: string;
  summary?: string;
  path?: string;
  type?: string;
  status: "locked" | "available" | "in-progress" | "mastered" | "paused";
  tags: string[];
  prerequisites: string[];
  unlocks: string[];
  familiarity: number;
  srsStage: number;
  lastReviewed?: string;
  nextReview?: string;
  created?: string;
  updated?: string;
  body: string;
};

export type NodeRecord = {
  node: LearnNode;
  filePath: string;
  relativePath: string;
  raw: Record<string, any>;
};

export type NextNodeResult = {
  node: LearnNode | null;
  reason?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeConfig(input: LearnConfigInput): LearnConfig {
  if (!input.libraryPath) {
    throw new Error("libraryPath is required in plugin config");
  }

  return {
    libraryPath: input.libraryPath,
    collectionName: input.collectionName || "learn",
    gitRemote: input.gitRemote,
    gitBranch: input.gitBranch || "main",
    gitSync: input.gitSync ?? false,
    gitAutoCommit: input.gitAutoCommit ?? true,
    autoInstallQmd: input.autoInstallQmd ?? true,
    mask: input.mask || "**/*.md",
    masteryThreshold: input.masteryThreshold ?? 4,
    srsIntervals: input.srsIntervals || DEFAULT_SRS_INTERVALS,
  };
}

export function parseCsv(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function ensureLibraryStructure(libraryPath: string): void {
  const folders = ["paths", "nodes", "contexts", "sessions", "resources"];
  folders.forEach((folder) => {
    fs.mkdirSync(path.join(libraryPath, folder), { recursive: true });
  });
}

export function resolvePathIndexPath(libraryPath: string, pathSlug: string): string {
  return path.join(libraryPath, "paths", pathSlug, "index.md");
}

export function resolveNodePath(
  libraryPath: string,
  pathSlug: string,
  nodeSlug: string
): { fullPath: string; relativePath: string } {
  const relativePath = path.join("nodes", pathSlug, `${nodeSlug}.md`);
  return { fullPath: path.join(libraryPath, relativePath), relativePath };
}

export function resolveContextPath(libraryPath: string, title: string): {
  fullPath: string;
  relativePath: string;
} {
  const datePrefix = new Date().toISOString().slice(0, 10);
  const slug = slugify(`${datePrefix}-${title}`);
  const relativePath = path.join("contexts", `${slug}.md`);
  return { fullPath: path.join(libraryPath, relativePath), relativePath };
}

export function buildPathContents(input: PathInput): string {
  const now = new Date().toISOString();
  const data = {
    title: input.title,
    summary: input.summary,
    status: input.status || "active",
    tags: input.tags || [],
    created: now,
    updated: now,
  };

  return matter.stringify("", data, MATTER_OPTIONS);
}

export function buildNodeContents(input: NodeInput): string {
  const now = new Date().toISOString();
  const pathSlug = input.path ? slugify(input.path) : "general";
  const nodeSlug = slugify(input.title);
  const id = input.id || `${pathSlug}/${nodeSlug}`;
  const status = (input.status as LearnNode["status"]) || "available";

  const data = {
    id,
    title: input.title,
    summary: input.summary,
    path: input.path,
    type: input.type || "concept",
    status,
    tags: input.tags || [],
    prerequisites: input.prerequisites || [],
    unlocks: input.unlocks || [],
    familiarity: 0,
    srs_stage: 0,
    last_reviewed: null,
    next_review: null,
    created: now,
    updated: now,
  };

  return matter.stringify(input.body, data, MATTER_OPTIONS);
}

export function buildContextContents(input: ContextInput): string {
  const now = new Date().toISOString();
  const data = {
    title: input.title,
    path: input.path,
    node: input.node,
    tags: input.tags || [],
    sources: input.sources || [],
    created: now,
    updated: now,
  };

  return matter.stringify(input.body, data, MATTER_OPTIONS);
}

function walkDirectory(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return walkDirectory(fullPath);
    }
    return [fullPath];
  });
}

function normalizeStatus(status?: string): LearnNode["status"] {
  if (!status) return "available";
  if (status === "locked") return "locked";
  if (status === "in-progress") return "in-progress";
  if (status === "mastered") return "mastered";
  if (status === "paused") return "paused";
  return "available";
}

function normalizeFamiliarity(value: unknown): number {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return clamp(value, 0, 5);
  }
  return 0;
}

export function loadNodes(libraryPath: string): NodeRecord[] {
  const nodesRoot = path.join(libraryPath, "nodes");
  const files = walkDirectory(nodesRoot).filter((filePath) =>
    NODE_EXTENSIONS.has(path.extname(filePath))
  );

  return files.map((filePath) => {
    const contents = fs.readFileSync(filePath, "utf-8");
    const parsed = matter(contents, MATTER_OPTIONS);
    const data = parsed.data as Record<string, any>;

    const title = data.title || path.basename(filePath);
    const nodeSlug = slugify(title);
    const pathValue = data.path || path.basename(path.dirname(filePath));
    const id = data.id || `${slugify(pathValue)}/${nodeSlug}`;
    const prerequisites = Array.isArray(data.prerequisites) ? data.prerequisites : [];
    const unlocks = Array.isArray(data.unlocks) ? data.unlocks : [];

    const status = normalizeStatus(data.status || (prerequisites.length ? "locked" : "available"));

    const node: LearnNode = {
      id,
      title,
      summary: data.summary,
      path: data.path,
      type: data.type,
      status,
      tags: Array.isArray(data.tags) ? data.tags : [],
      prerequisites,
      unlocks,
      familiarity: normalizeFamiliarity(data.familiarity),
      srsStage: typeof data.srs_stage === "number" ? data.srs_stage : 0,
      lastReviewed: data.last_reviewed || undefined,
      nextReview: data.next_review || undefined,
      created: data.created,
      updated: data.updated,
      body: parsed.content.trim(),
    };

    return {
      node,
      filePath,
      relativePath: path.relative(libraryPath, filePath),
      raw: data,
    };
  });
}

export function saveNode(record: NodeRecord, node: LearnNode): void {
  const now = new Date().toISOString();
  const data = {
    ...record.raw,
    id: node.id,
    title: node.title,
    summary: node.summary,
    path: node.path,
    type: node.type,
    status: node.status,
    tags: node.tags,
    prerequisites: node.prerequisites,
    unlocks: node.unlocks,
    familiarity: node.familiarity,
    srs_stage: node.srsStage,
    last_reviewed: node.lastReviewed || null,
    next_review: node.nextReview || null,
    created: node.created || record.raw.created || now,
    updated: now,
  };

  const body = node.body || record.node.body || "";
  const contents = matter.stringify(body, data, MATTER_OPTIONS);
  fs.writeFileSync(record.filePath, contents, "utf-8");
}

export function unlockEligibleNodes(
  records: NodeRecord[],
  masteryThreshold: number
): NodeRecord[] {
  const byId = new Map(records.map((record) => [record.node.id, record]));
  const unlocked: NodeRecord[] = [];

  records.forEach((record) => {
    if (record.node.status !== "locked") return;
    const meetsPrereqs = record.node.prerequisites.every((id) => {
      const prereq = byId.get(id)?.node;
      if (!prereq) return false;
      return prereq.status === "mastered" || prereq.familiarity >= masteryThreshold;
    });
    if (meetsPrereqs) {
      record.node.status = "available";
      unlocked.push(record);
    }
  });

  return unlocked;
}

export function pickNextNode(records: NodeRecord[]): NextNodeResult {
  const now = new Date();
  const unlocked = records.filter((record) => record.node.status !== "locked");
  const due = unlocked.filter((record) => {
    if (!record.node.nextReview) return false;
    return new Date(record.node.nextReview) <= now;
  });

  if (due.length > 0) {
    const selected = due.sort((a, b) => {
      const aTime = new Date(a.node.nextReview || 0).getTime();
      const bTime = new Date(b.node.nextReview || 0).getTime();
      return aTime - bTime;
    })[0];
    return { node: selected.node, reason: "due-review" };
  }

  const available = unlocked.filter((record) => record.node.status === "available");
  if (available.length > 0) {
    const selected = available.sort((a, b) => {
      if (a.node.familiarity !== b.node.familiarity) {
        return a.node.familiarity - b.node.familiarity;
      }
      const aCreated = a.node.created ? new Date(a.node.created).getTime() : 0;
      const bCreated = b.node.created ? new Date(b.node.created).getTime() : 0;
      return aCreated - bCreated;
    })[0];
    return { node: selected.node, reason: "new-available" };
  }

  const inProgress = unlocked.filter((record) => record.node.status === "in-progress");
  if (inProgress.length > 0) {
    const selected = inProgress.sort((a, b) => a.node.familiarity - b.node.familiarity)[0];
    return { node: selected.node, reason: "continue" };
  }

  return { node: null };
}

export function scheduleReview(
  node: LearnNode,
  rating: "again" | "hard" | "good" | "easy",
  intervals: number[],
  masteryThreshold: number
): LearnNode {
  const now = new Date();
  const next = { ...node };
  const maxStage = intervals.length - 1;

  const familiarityDelta = rating === "again" ? -1 : rating === "hard" ? 0 : rating === "good" ? 1 : 2;
  next.familiarity = clamp(node.familiarity + familiarityDelta, 0, 5);

  if (rating === "again") {
    next.srsStage = Math.max(0, node.srsStage - 1);
  } else if (rating === "hard") {
    next.srsStage = clamp(node.srsStage, 0, maxStage);
  } else if (rating === "good") {
    next.srsStage = clamp(node.srsStage + 1, 0, maxStage);
  } else {
    next.srsStage = clamp(node.srsStage + 2, 0, maxStage);
  }

  const intervalDays = intervals[next.srsStage] || intervals[intervals.length - 1] || 1;
  const nextReview = new Date(now.getTime());
  nextReview.setUTCDate(nextReview.getUTCDate() + intervalDays);

  next.lastReviewed = now.toISOString();
  next.nextReview = nextReview.toISOString();
  next.status = next.familiarity >= masteryThreshold ? "mastered" : "in-progress";

  return next;
}

export function appendSessionLog(libraryPath: string, line: string): void {
  const date = new Date().toISOString().slice(0, 10);
  const sessionPath = path.join(libraryPath, "sessions", `${date}.md`);
  const entry = `- ${new Date().toISOString()} ${line}`;

  if (!fs.existsSync(sessionPath)) {
    fs.writeFileSync(sessionPath, `# Session ${date}\n\n${entry}\n`, "utf-8");
    return;
  }

  fs.appendFileSync(sessionPath, `${entry}\n`, "utf-8");
}
