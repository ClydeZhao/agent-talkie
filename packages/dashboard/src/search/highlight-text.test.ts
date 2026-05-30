// @vitest-environment happy-dom
import { render } from "lit";
import { describe, expect, it } from "vitest";
import { highlightText } from "./highlight-text.js";

function renderToContainer(result: unknown): HTMLDivElement {
  const wrapper = document.createElement("div");
  render(result, wrapper);
  return wrapper;
}

describe("highlightText", () => {
  it("returns plain string when query is empty", () => {
    const result = highlightText("hello world", "");
    expect(typeof result).toBe("string");
    expect(result).toBe("hello world");
  });

  it("returns plain string when query is whitespace-only", () => {
    const result = highlightText("hello world", "   ");
    expect(typeof result).toBe("string");
    expect(result).toBe("hello world");
  });

  it("wraps single matching term in <mark>", () => {
    const el = renderToContainer(highlightText("hello world", "hello"));
    const marks = el.querySelectorAll("mark.search-hit");
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe("hello");
    expect(el.textContent).toBe("hello world");
  });

  it("highlights multiple occurrences", () => {
    const el = renderToContainer(highlightText("foo bar foo", "foo"));
    const marks = el.querySelectorAll("mark.search-hit");
    expect(marks.length).toBe(2);
    expect(marks[0].textContent).toBe("foo");
    expect(marks[1].textContent).toBe("foo");
  });

  it("highlights multiple terms (OR per term)", () => {
    const el = renderToContainer(
      highlightText("alice sent a message to bob", "alice bob"),
    );
    const marks = el.querySelectorAll("mark.search-hit");
    expect(marks.length).toBe(2);
    expect(marks[0].textContent).toBe("alice");
    expect(marks[1].textContent).toBe("bob");
  });

  it("highlights case-insensitively while preserving original case", () => {
    const el = renderToContainer(
      highlightText("Hello HELLO hello", "hello"),
    );
    const marks = el.querySelectorAll("mark.search-hit");
    expect(marks.length).toBe(3);
    expect(marks[0].textContent).toBe("Hello");
    expect(marks[1].textContent).toBe("HELLO");
    expect(marks[2].textContent).toBe("hello");
  });

  it("produces no <mark> elements when no terms match", () => {
    const el = renderToContainer(highlightText("hello world", "xyz"));
    const marks = el.querySelectorAll("mark.search-hit");
    expect(marks.length).toBe(0);
    expect(el.textContent).toBe("hello world");
  });

  it("escapes regex special characters in search terms", () => {
    const el = renderToContainer(
      highlightText("price is $100 (approx)", "$100"),
    );
    const marks = el.querySelectorAll("mark.search-hit");
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe("$100");
  });
});
