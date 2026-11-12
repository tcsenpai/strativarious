import { describe, expect, test } from "bun:test";
import demo from "../palettes/demo.json" with { type: "json" };
import examples from "../palettes/examples.json" with { type: "json" };
import { validatePalette } from "../src/store.js";

describe("bundled palettes", () => {
  for (const p of [demo, ...examples]) {
    test(`${p.name} is a valid palette and survives validation unchanged`, () => {
      const v = validatePalette(p);
      expect(v.pigments.length).toBe(p.pigments.length);
      // ids drive the "pigments used" checkboxes: they must be unique and stable
      expect(new Set(v.pigments.map((x) => x.id)).size).toBe(p.pigments.length);
      v.pigments.forEach((x, i) => {
        expect(x.name).toBe(p.pigments[i].name); // not truncated
        if (p.pigments[i].id) expect(x.id).toBe(p.pigments[i].id);
      });
    });
  }

  test("example ids are unique (they are seeded into the same store)", () => {
    expect(new Set(examples.map((e) => e.id)).size).toBe(examples.length);
  });
});

test("combining the same pigment from two palettes keeps ids unique", () => {
  const pig = examples[0].pigments[0];
  const v = validatePalette({ name: "mix", synthetic: true, pigments: [pig, pig, examples[0].pigments[1]] });
  expect(new Set(v.pigments.map((x) => x.id)).size).toBe(3);
});
