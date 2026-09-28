import { describe, it, expect } from "bun:test";
import { aggregateDay } from "../../src/aggregation/dayAggregator";
import type { ActivityEvent } from "../../src/shared/types";

function evt(projectKey: string, timestamp: string): ActivityEvent {
  return { projectKey, timestamp, source: "github" };
}

describe("aggregateDay", () => {
  it("returns an empty array for a day with no events", () => {
    expect(aggregateDay([])).toEqual([]);
  });

  it("assigns all 8h to a single project spanning the day", () => {
    const blocks = aggregateDay([
      evt("github:a/b", "2026-01-05T08:00:00Z"),
      evt("github:a/b", "2026-01-05T14:00:00Z"),
    ]);
    expect(blocks.length).toBe(1);
    expect(blocks[0].projectKey).toBe("github:a/b");
    expect(blocks[0].hours).toBe(8);
    expect(new Date(blocks[0].endIso).getTime() - new Date(blocks[0].beginIso).getTime()).toBe(8 * 3600 * 1000);
  });

  it("splits two projects proportionally to their activity span and sums to 8h", () => {
    // project A spans 6h, project B spans 2h -> ratio 3:1
    const blocks = aggregateDay([
      evt("github:a", "2026-01-05T08:00:00Z"),
      evt("github:a", "2026-01-05T14:00:00Z"),
      evt("jira:PROJ", "2026-01-05T15:00:00Z"),
      evt("jira:PROJ", "2026-01-05T17:00:00Z"),
    ]);
    const total = blocks.reduce((sum, b) => sum + b.hours, 0);
    expect(total).toBe(8);
    const a = blocks.find((b) => b.projectKey === "github:a")!;
    const b = blocks.find((b) => b.projectKey === "jira:PROJ")!;
    expect(a.hours).toBeGreaterThan(b.hours);
    expect(a.hours % 0.5).toBe(0);
    expect(b.hours % 0.5).toBe(0);
  });

  it("gives every project a non-zero share even when some have a single (zero-span) event, and still sums to 8h", () => {
    const blocks = aggregateDay([
      evt("github:a", "2026-01-05T08:00:00Z"),
      evt("github:a", "2026-01-05T13:00:00Z"),
      evt("jira:PROJ1", "2026-01-05T14:00:00Z"), // single event, zero span
      evt("jira:PROJ2", "2026-01-05T16:00:00Z"), // single event, zero span
    ]);
    expect(blocks.length).toBe(3);
    for (const block of blocks) {
      expect(block.hours).toBeGreaterThan(0);
    }
    const total = blocks.reduce((sum, b) => sum + b.hours, 0);
    expect(total).toBe(8);
  });

  it("produces sequential, non-overlapping blocks ordered by first activity", () => {
    const blocks = aggregateDay([
      evt("jira:PROJ", "2026-01-05T15:00:00Z"),
      evt("jira:PROJ", "2026-01-05T16:00:00Z"),
      evt("github:a", "2026-01-05T08:00:00Z"),
      evt("github:a", "2026-01-05T09:00:00Z"),
    ]);
    expect(blocks[0].projectKey).toBe("github:a"); // earlier first-activity comes first
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].beginIso).toBe(blocks[i - 1].endIso);
    }
  });
});
