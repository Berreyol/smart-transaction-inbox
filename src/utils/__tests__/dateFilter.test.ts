import { resolveDateRange } from "../dateFilter";

const FIXED_NOW = new Date(2024, 5, 15, 12, 0, 0); // June 15, 2024, noon, local time

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("resolveDateRange", () => {
  it("all - returns an unbounded range", () => {
    const { start, end } = resolveDateRange("all", "", "");
    expect(start).toBeNull();
    expect(end).toBeNull();
  });

  it("today - returns the start and end of the current day", () => {
    const { start, end } = resolveDateRange("today", "", "");
    expect(start).toEqual(new Date(2024, 5, 15, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2024, 5, 15, 23, 59, 59, 999));
  });

  it("7d - returns the last 7 days, including today", () => {
    const { start, end } = resolveDateRange("7d", "", "");
    expect(start).toEqual(new Date(2024, 5, 9, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2024, 5, 15, 23, 59, 59, 999));
  });

  it("30d - returns the last 30 days, including today", () => {
    const { start, end } = resolveDateRange("30d", "", "");
    expect(start).toEqual(new Date(2024, 4, 17, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2024, 5, 15, 23, 59, 59, 999));
  });

  it("month - returns from the 1st of the current month through today", () => {
    const { start, end } = resolveDateRange("month", "", "");
    expect(start).toEqual(new Date(2024, 5, 1));
    expect(end).toEqual(new Date(2024, 5, 15, 23, 59, 59, 999));
  });

  it("custom - parses valid YYYY-MM-DD start/end bounds", () => {
    const { start, end } = resolveDateRange("custom", "2024-01-01", "2024-01-31");
    expect(start).toEqual(new Date(2024, 0, 1, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2024, 0, 31, 23, 59, 59, 999));
  });

  it("custom - an invalid start bound is treated as unbounded, independent of a valid end bound", () => {
    const { start, end } = resolveDateRange("custom", "not-a-date", "2024-01-31");
    expect(start).toBeNull();
    expect(end).toEqual(new Date(2024, 0, 31, 23, 59, 59, 999));
  });

  it("custom - an invalid end bound is treated as unbounded, independent of a valid start bound", () => {
    const { start, end } = resolveDateRange("custom", "2024-01-01", "31/01/2024");
    expect(start).toEqual(new Date(2024, 0, 1, 0, 0, 0, 0));
    expect(end).toBeNull();
  });

  it("custom - empty bounds on both sides resolve to an unbounded range", () => {
    const { start, end } = resolveDateRange("custom", "", "");
    expect(start).toBeNull();
    expect(end).toBeNull();
  });
});
