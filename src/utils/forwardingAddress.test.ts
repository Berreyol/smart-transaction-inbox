import { buildForwardingAddress } from "./forwardingAddress";

describe("buildForwardingAddress", () => {
  it("inserts the token as a +tag before the @", () => {
    expect(buildForwardingAddress("inbox@pipedream.net", "ab12cd34ef56")).toBe("inbox+ab12cd34ef56@pipedream.net");
  });

  it("returns null when base is undefined", () => {
    expect(buildForwardingAddress(undefined, "ab12")).toBeNull();
  });

  it("returns null when base is an empty string", () => {
    expect(buildForwardingAddress("", "ab12")).toBeNull();
  });

  it("returns null when base has no @", () => {
    expect(buildForwardingAddress("not-an-email", "ab12")).toBeNull();
  });

  it("returns null when @ is the first character (no local part)", () => {
    expect(buildForwardingAddress("@pipedream.net", "ab12")).toBeNull();
  });
});
