import { colorForCategory } from "./categoryColors";

const OVERFLOW_COLOR = "#9ca3af";

describe("colorForCategory", () => {
  it("returns the palette color at the category's position in orderedNames", () => {
    const orderedNames = ["Bills", "Food", "Transport"];

    expect(colorForCategory("Bills", orderedNames)).toBe("#2a78d6");
    expect(colorForCategory("Food", orderedNames)).toBe("#eb6834");
    expect(colorForCategory("Transport", orderedNames)).toBe("#1baf7a");
  });

  it("depends on position in orderedNames, not on any inherent property of the name", () => {
    // Same name, different position (e.g. a different alphabetical sort) -> different color.
    expect(colorForCategory("Food", ["Food", "Bills"])).toBe("#2a78d6");
    expect(colorForCategory("Food", ["Bills", "Food"])).toBe("#eb6834");
  });

  it("returns the overflow color when the category isn't in orderedNames", () => {
    expect(colorForCategory("Unknown", ["Bills", "Food"])).toBe(OVERFLOW_COLOR);
  });

  it("returns the overflow color past the 8-color palette", () => {
    const orderedNames = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];

    expect(colorForCategory("H", orderedNames)).toBe("#e34948"); // 8th slot, last real color
    expect(colorForCategory("I", orderedNames)).toBe(OVERFLOW_COLOR); // 9th slot, overflow
  });

  it("returns the overflow color for an empty orderedNames list", () => {
    expect(colorForCategory("Food", [])).toBe(OVERFLOW_COLOR);
  });
});
