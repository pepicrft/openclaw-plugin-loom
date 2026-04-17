---
name: loom-learning-graph
description: "Create, link, and review learning graph nodes using the Loom plugin. Manages paths, nodes, context captures, spaced repetition scheduling, and prerequisite-based unlocks. Use when the user wants to learn a new topic, track knowledge, build a concept map, review with spaced repetition, capture a real-world learning moment, or query their learning library."
---

# Loom Learning Graph

Build and expand a local-first learning graph of paths, nodes, and context captures with spaced repetition reviews.

## Core Model

- **Path**: a learning track (e.g., `nix`, `german`). Created via `learn_add_node` with a `path` parameter.
- **Node**: atomic learning unit with prerequisites, unlocks, and SRS scheduling. Status flows: `locked` → `available` → `in-progress` → `mastered`.
- **Context**: real-world capture that seeds new nodes or enriches existing ones.

## When to Act

| User says | Action |
|-----------|--------|
| "I want to learn X" | Create a path and seed 1–3 starter nodes |
| Mentions a new concept or confusion | Create a node with `learn_add_node` |
| Describes a real-world situation | Capture with `learn_capture`, then create or link nodes |
| Asks "what should I study next?" | Call `learn_next` with `start: true` |
| Finishes studying a node | Call `learn_review` with a rating |
| Searches for something in their library | Call `learn_query` |

## Workflow

1. **Capture context** when the user mentions a real situation → `learn_capture`.
2. **Create or update nodes** from the context → `learn_add_node`.
3. **Check unlocks** — nodes whose prerequisites are mastered auto-unlock via `learn_next`.
4. **Recommend next** → `learn_next` with `start: true` to mark it in-progress.
5. **Schedule review** after study → `learn_review` with rating (`again`, `hard`, `good`, `easy`).

## Tool Reference

### learn_add_node

Create a learning node. Required: `title`, `body`. Key optional fields: `path`, `summary`, `type` (concept|practice|project|checkpoint), `prerequisites`, `unlocks`, `tags`.

```json
{
  "title": "Nix Flakes",
  "body": "Flakes provide a standard way to write Nix expressions...\n\n## Check yourself\nWhat does `nix flake init` create?",
  "path": "nix",
  "summary": "Understand flake.nix structure and inputs/outputs",
  "type": "concept",
  "prerequisites": ["nix/store-basics"],
  "unlocks": ["nix/flake-outputs"],
  "tags": ["nix", "packaging"]
}
```

### learn_capture

Capture a real-world learning moment. Required: `title`, `body`. Optional: `path`, `node`, `tags`.

```json
{
  "title": "German bakery order",
  "body": "Tried ordering Schrippen and got confused about plural forms.",
  "path": "german",
  "tags": ["speaking", "german"]
}
```

### learn_next

Pick the next node to study. Prioritizes: due reviews → available nodes (lowest familiarity) → in-progress nodes. Pass `start: true` to mark the node as in-progress.

### learn_review

Review a node and schedule the next repetition. Required: `id`, `rating`. Ratings: `again` (−1 familiarity), `hard` (no change), `good` (+1), `easy` (+2). Node reaches `mastered` status at familiarity ≥ 4.

### learn_query

Search the learning library via QMD. Required: `query`. Optional: `mode` (search|vsearch|query), `limit`, `minScore`.

## Node Authoring Guidelines

- Keep nodes narrow, testable, and self-contained.
- Include: a short explanation, a concrete example or exercise, prerequisite/follow-up links by `id`, and a "check yourself" prompt.
- Use `prerequisites` to gate advanced topics; use `unlocks` to signal next steps.
- Link nodes by `id` using wikilinks (`[[nix/derivations]]`) or standard Markdown links.

## Defaults

- SRS intervals: `[1, 3, 7, 14, 30, 60, 120, 240]` days.
- Mastery threshold: familiarity ≥ 4.
- Nodes are Markdown (`.md`).
