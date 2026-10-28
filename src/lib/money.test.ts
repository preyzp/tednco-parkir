import { describe, expect, it } from "vitest";
import { caretAfterFormat, formatIdr, formatIdrInput, formatRupiah, parseIdrInput } from "./money";
import { formatRupiah as tariffFormatRupiah } from "./parking-tariff";

describe("id-ID display", () => {
  it.each([[1, "1"], [5_000, "5.000"], [10_000, "10.000"], [100_000, "100.000"], [1_000_000, "1.000.000"], [10_000_000, "10.000.000"]])("%i → %s / Rp%s", (amount, text) => {
    expect(formatIdr(amount)).toBe(text);
    expect(formatRupiah(amount)).toBe(`Rp${text}`);
  });
  it("keeps the existing import path", () => {
    expect(tariffFormatRupiah(10_000_000)).toBe("Rp10.000.000");
  });
});

describe("parseIdrInput (strict, never reinterprets)", () => {
  it.each([["1", 1], ["5000", 5_000], ["5.000", 5_000], ["10.000", 10_000], ["1.000.000", 1_000_000], ["10.000.000", 10_000_000], ["10000000", 10_000_000], [" 5.000 ", 5_000], ["10.000.001", 10_000_001]])("%j → %i", (text, amount) => {
    expect(parseIdrInput(text)).toBe(amount);
  });
  it.each(["", "   ", "abc", "5.00", "50.00", "1,5", "5.000,00", "-5000", "+5000", "5 000", "Rp5.000", ".5000", "5000.", "1e6", "99999999999999999999"])("%j → null", (text) => {
    expect(parseIdrInput(text)).toBeNull();
  });
});

describe("formatIdrInput (live typing)", () => {
  it.each([
    ["", ""], ["1", "1"], ["5000", "5.000"], ["10000", "10.000"], ["1000000", "1.000.000"], ["10000000", "10.000.000"],
    ["5.0000", "50.000"], // typing a digit after "5.000"
    ["5.00", "500"],      // deleting a digit from "5.000"
    ["0005", "5"], ["0", "0"],
    ["100000000", "100.000.000"], ["1234567890", "123.456.789"], // capped at 9 digits: over-limit stays visible
  ])("%j → %j", (text, formatted) => {
    expect(formatIdrInput(text)).toBe(formatted);
  });
  it.each(["abc", "1,5", "5.000,5", "-1", "Rp1"])("keeps text with other characters unchanged (stays invalid): %j", (text) => {
    expect(formatIdrInput(text)).toBe(text);
    expect(parseIdrInput(formatIdrInput(text))).toBeNull();
  });
  it("a paste is strict: valid values are regrouped, malformed ones are kept as pasted", () => {
    expect(formatIdrInput("10000000", { paste: true })).toBe("10.000.000");
    expect(formatIdrInput("10.000.000", { paste: true })).toBe("10.000.000");
    expect(formatIdrInput("5.00", { paste: true })).toBe("5.00");
    expect(parseIdrInput(formatIdrInput("5.00", { paste: true }))).toBeNull();
  });
  it("round-trips without changing the amount", () => {
    for (const amount of [1, 5_000, 10_000, 1_000_000, 10_000_000]) expect(parseIdrInput(formatIdrInput(String(amount)))).toBe(amount);
  });
});

it("keeps the caret after the same digit when regrouping", () => {
  expect(caretAfterFormat("50000", 5, "50.000")).toBe(6);
  expect(caretAfterFormat("5.0000", 3, "50.000")).toBe(2); // after "5", "0"
  expect(caretAfterFormat("5.0000", 2, "50.000")).toBe(1); // after "5" only
  expect(caretAfterFormat("1000", 0, "1.000")).toBe(0);
  expect(caretAfterFormat("10000", 3, "10.000")).toBe(4);
});
