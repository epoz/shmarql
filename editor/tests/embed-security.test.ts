import { describe, expect, it } from "vitest";
import {
  normalizeEmbedOrigin,
  sanitizeEmbedTokenList,
  validateEmbedUrl
} from "@lodeon/nodes/embed/security";

describe("Embed security", () => {
  it("validates empty and invalid embed URLs", () => {
    expect(validateEmbedUrl("", ["https://example.org"]).status).toBe("empty");
    expect(validateEmbedUrl("not a url", ["https://example.org"])).toMatchObject({
      status: "invalid"
    });
    expect(validateEmbedUrl("javascript:alert(1)", ["https://example.org"])).toMatchObject({
      status: "invalid",
      code: "embed.url_invalid",
      variables: {
        reason: "http_https_required"
      }
    });
  });

  it("allows only configured origins", () => {
    expect(
      validateEmbedUrl("https://player.example.org/embed/123", [
        "https://player.example.org/some/path"
      ])
    ).toMatchObject({
      status: "allowed",
      origin: "https://player.example.org"
    });

    expect(
      validateEmbedUrl("https://blocked.example.org/embed/123", [
        "https://player.example.org"
      ])
    ).toMatchObject({
      status: "blocked",
      origin: "https://blocked.example.org"
    });
  });

  it("normalizes origins and sanitizes iframe token lists", () => {
    expect(normalizeEmbedOrigin("https://player.example.org/viewer/123")).toBe(
      "https://player.example.org"
    );
    expect(normalizeEmbedOrigin("invalid")).toBe("");
    expect(
      sanitizeEmbedTokenList([
        "allow-scripts",
        " allow-popups ",
        "bad token",
        "allow_same-origin",
        5
      ])
    ).toEqual(["allow-scripts", "allow-popups", "allow_same-origin"]);
  });
});
