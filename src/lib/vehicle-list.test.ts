import { describe, expect, it } from "vitest";
import { vehicleCheckoutBackLabel, vehicleCheckoutHref, vehicleCheckoutReturnPath, vehicleEntryBackLabel, vehicleEntryHref, vehicleEntryReturnPath, vehicleExitSearchHref } from "./vehicle-list";

describe("vehicle entry returnTo (allowlisted internal back target)", () => {
  it("falls back to the vehicle list when missing", () => {
    expect(vehicleEntryReturnPath(undefined)).toBe("/app/kendaraan");
    expect(vehicleEntryReturnPath("")).toBe("/app/kendaraan");
  });
  it("accepts Beranda and the vehicle list, re-serializing only known filters", () => {
    expect(vehicleEntryReturnPath("/app")).toBe("/app");
    expect(vehicleEntryReturnPath("/app?evil=1")).toBe("/app");
    expect(vehicleEntryReturnPath("/app/kendaraan")).toBe("/app/kendaraan");
    expect(vehicleEntryReturnPath("/app/kendaraan?q=%20b%2012%20&status=completed&type=mobil&page=3&tenantId=x")).toBe("/app/kendaraan?q=b+12&status=completed&type=mobil&page=3");
    expect(vehicleEntryReturnPath("/app/kendaraan?status=deleted&type=truk&page=-1")).toBe("/app/kendaraan");
    expect(vehicleEntryReturnPath(["/app", "/platform"])).toBe("/app");
  });
  it.each([
    "https://evil.example", "http://localhost:3000/app", "//evil.example/app", "/\\evil.example", "\\\\evil.example",
    "javascript:alert(1)", "/\t/evil.example", "/app/kendaraan/masuk", "/app/pengaturan/keamanan", "/platform/tenants", "/APP", "app",
  ])("rejects %j (open redirect / non-allowlisted)", (value) => {
    expect(vehicleEntryReturnPath(value)).toBe("/app/kendaraan");
  });
  it("builds entry links that carry returnTo only when it differs from the fallback", () => {
    expect(vehicleEntryHref("/app")).toBe("/app/kendaraan/masuk?returnTo=%2Fapp");
    expect(vehicleEntryHref("/app/kendaraan")).toBe("/app/kendaraan/masuk");
    expect(vehicleEntryHref("/app/kendaraan?status=all")).toBe("/app/kendaraan/masuk?returnTo=%2Fapp%2Fkendaraan%3Fstatus%3Dall");
    expect(vehicleEntryHref("https://evil.example")).toBe("/app/kendaraan/masuk");
  });
  it("names the destination for screen readers", () => {
    expect(vehicleEntryBackLabel("/app")).toBe("Beranda");
    expect(vehicleEntryBackLabel("/app/kendaraan?status=all")).toBe("daftar kendaraan");
  });
});

describe("checkout returnTo (vehicle list or checkout search)", () => {
  it("accepts the list (filters re-serialized) and the checkout search (q/page); fallback the search", () => {
    expect(vehicleCheckoutReturnPath("/app/kendaraan?status=all&type=motor&tenantId=x")).toBe("/app/kendaraan?status=all&type=motor");
    expect(vehicleCheckoutReturnPath("/app/kendaraan/keluar?q=%20b%201%20&page=2&status=all")).toBe("/app/kendaraan/keluar?q=b+1&page=2");
    expect(vehicleCheckoutReturnPath(undefined)).toBe("/app/kendaraan/keluar");
  });
  it.each(["/app", "/app/kendaraan/masuk", "/app/kendaraan/keluar/" + "1".repeat(24), "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/platform"])("rejects %j", (value) => {
    expect(vehicleCheckoutReturnPath(value)).toBe("/app/kendaraan/keluar");
  });
  it("builds checkout links and labels", () => {
    expect(vehicleCheckoutHref("1".repeat(24), "/app/kendaraan/keluar")).toBe(`/app/kendaraan/keluar/${"1".repeat(24)}`);
    expect(vehicleCheckoutHref("1".repeat(24), "/app/kendaraan")).toBe(`/app/kendaraan/keluar/${"1".repeat(24)}?returnTo=%2Fapp%2Fkendaraan`);
    expect(vehicleCheckoutHref("../x", "https://evil.example")).toBe("/app/kendaraan/keluar/..%2Fx");
    expect(vehicleCheckoutBackLabel("/app/kendaraan/keluar?q=1")).toBe("pencarian kendaraan keluar");
    expect(vehicleCheckoutBackLabel("/app/kendaraan")).toBe("daftar kendaraan");
    expect(vehicleExitSearchHref({ q: "B1", page: 1 })).toBe("/app/kendaraan/keluar?q=B1");
  });
  it("the entry form still rejects the checkout pages", () => {
    expect(vehicleEntryReturnPath("/app/kendaraan/keluar")).toBe("/app/kendaraan");
  });
});
