import { describe, expect, it } from "vitest";
import { slugify, scheduleReview, type LearnNode } from "../learn.js";

describe("learn helpers", () => {
  it("slugify normalizes strings", () => {
    expect(slugify("Nix Derivations")).toBe("nix-derivations");
    expect(slugify("  German: Akkusativ!  ")).toBe("german-akkusativ");
  });

  it("schedules a future review", () => {
    const node: LearnNode = {
      id: "nix/store",
      title: "Nix store basics",
      path: "nix",
      type: "concept",
      status: "available",
      tags: [],
      prerequisites: [],
      unlocks: [],
      familiarity: 0,
      srsStage: 0,
      body: "",
    };

    const updated = scheduleReview(node, "good", [1, 3, 7], 4);
    expect(updated.nextReview).toBeTruthy();
    expect(updated.srsStage).toBeGreaterThanOrEqual(0);
  });
});
