import { categoriesForType } from "../categories";
import type { Category } from "../../types/database";

function makeCategory(overrides: Partial<Category>): Category {
  return {
    id: "1",
    user_id: "user-1",
    name: "Food",
    type: "expense",
    created_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("categoriesForType", () => {
  const categories: Category[] = [
    makeCategory({ id: "1", name: "Food", type: "expense" }),
    makeCategory({ id: "2", name: "Salary", type: "income" }),
    makeCategory({ id: "3", name: "Transport", type: "expense" }),
  ];

  it("returns only categories matching the given type, preserving order", () => {
    expect(categoriesForType(categories, "expense")).toEqual([categories[0], categories[2]]);
  });

  it("returns an empty array when type is null", () => {
    expect(categoriesForType(categories, null)).toEqual([]);
  });

  it("returns an empty array when no category matches the given type", () => {
    const onlyExpenses = [makeCategory({ type: "expense" })];
    expect(categoriesForType(onlyExpenses, "income")).toEqual([]);
  });

  it("returns an empty array for an empty categories list", () => {
    expect(categoriesForType([], "expense")).toEqual([]);
  });
});
