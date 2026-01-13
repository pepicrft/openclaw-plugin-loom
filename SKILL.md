# Loom Learning Graph Skill

This skill guides agents on how to use the Loom plugin to build and expand a learning graph over time.

## Purpose
- Help users navigate learning paths (e.g., Nix, German) through graph nodes.
- Expand the graph organically as new knowledge appears.
- Keep knowledge warm with spaced repetition reviews.

## Core Model
- **Path**: a learning track (e.g., `nix`, `german`).
- **Node**: atomic learning unit with prerequisites, unlocks, and review scheduling.
- **Context**: real-world capture that should seed new nodes or enrich existing ones.

## What a Node Contains
- A short explanation in your own words
- A concrete example or mini exercise
- Links to prerequisite or follow-up nodes by `id`
- A “check yourself” prompt (question or task)

## When to Create Nodes
- When a user says “I want to learn X”, **create a path** for X and seed 1-3 starter nodes.
- When a user mentions a new concept, term, or confusion point, **create a node**.
- When a context capture reveals missing scaffolding, **add prerequisites**.
- When a node reaches mastery, **add or unlock a next node** that builds on it.
- When a session reveals gaps, **insert a bridging node**.

## How to Expand the Graph
- Prefer **small, focused nodes** over large, vague ones.
- Use `prerequisites` to gate advanced topics.
- Add `unlocks` to highlight natural next steps.
- Always link nodes by `id` in body text (wikilinks are fine).

## Workflow (Agent)
1. **Capture context** when the user mentions a real situation.
2. **Create or update nodes** from the context.
3. **Unlock nodes** when prerequisites are mastered.
4. **Recommend next** using `learn next` and prompt review with `learn review`.

## Tooling
- `learn_add_node` to add nodes.
- `learn_capture` to capture contexts.
- `learn_next` to pick the next node.
- `learn_review` to schedule repetition.
- `learn_query` to search the library.

## Defaults
- Nodes are Markdown (`.md`).
- Spaced repetition intervals default to `[1, 3, 7, 14, 30, 60, 120, 240]` days.

## Example Triggers
- “I read about Nix flakes today” → add node `nix/flakes` with prereqs.
- “I got confused ordering coffee in German” → capture context and add node `german/ordering-coffee`.
