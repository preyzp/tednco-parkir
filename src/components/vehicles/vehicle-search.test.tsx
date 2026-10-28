// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vehicleSearchKey } from "../../lib/vehicle-list";
const mocks = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
import { VehicleSearch, vehicleSearchDebounceMs } from "./vehicle-search";

const input = () => screen.getByLabelText("Cari nomor polisi") as HTMLInputElement;
const type = (text: string) => fireEvent.change(input(), { target: { value: text } });
const hrefs = () => mocks.replace.mock.calls.map(([href]) => href as string);
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
beforeEach(() => { vi.useFakeTimers(); mocks.replace.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("keys searches like the repository (case-insensitive, whitespace removed, ≤15)", () => {
  expect(vehicleSearchKey(" b 12 ")).toBe("B12");
  expect(vehicleSearchKey("B12")).toBe("B12");
  expect(vehicleSearchKey(undefined)).toBe("");
  expect(vehicleSearchKey("x".repeat(20))).toHaveLength(15);
});

describe("debounce", () => {
  it("navigates once, 350 ms after typing stops, with page reset and scroll kept", async () => {
    render(<VehicleSearch status="active" type="all" />);
    type("B"); await wait(200); type("B 1"); await wait(vehicleSearchDebounceMs - 1);
    expect(mocks.replace).not.toHaveBeenCalled();
    await wait(1);
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith("/app/kendaraan?q=B+1", { scroll: false });
  });
  it("keeps the active status/type filters and drops the page", async () => {
    render(<VehicleSearch q="B1" status="completed" type="motor" />);
    type("B12"); await wait(vehicleSearchDebounceMs);
    expect(hrefs()).toEqual(["/app/kendaraan?q=B12&status=completed&type=motor"]);
  });
});

describe("immediate search", () => {
  it("Cari runs at once and cancels the pending debounce", async () => {
    render(<VehicleSearch status="active" type="all" />);
    type("1234"); fireEvent.click(screen.getByRole("button", { name: "Cari" }));
    expect(hrefs()).toEqual(["/app/kendaraan?q=1234"]);
    await wait(vehicleSearchDebounceMs * 2);
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });
  it("Enter (form submit) runs at once", () => {
    render(<VehicleSearch status="all" type="mobil" />);
    type("f 9"); fireEvent.submit(input().closest("form")!);
    expect(hrefs()).toEqual(["/app/kendaraan?q=f+9&status=all&type=mobil"]);
  });
});

describe("clearing", () => {
  it("emptying the input returns to the active filters without q", async () => {
    render(<VehicleSearch q="B12" status="completed" type="all" />);
    type(""); await wait(vehicleSearchDebounceMs);
    expect(hrefs()).toEqual(["/app/kendaraan?status=completed"]);
  });
  it("'Hapus pencarian' clears at once", () => {
    render(<VehicleSearch q="B12" status="active" type="motor" />);
    fireEvent.click(screen.getByRole("button", { name: "Hapus pencarian" }));
    expect(input().value).toBe("");
    expect(hrefs()).toEqual(["/app/kendaraan?type=motor"]);
  });
});

describe("no duplicate requests", () => {
  it("skips navigation when the effective query is unchanged", async () => {
    render(<VehicleSearch q="B12" status="active" type="all" />);
    type("b 12 "); await wait(vehicleSearchDebounceMs);
    fireEvent.click(screen.getByRole("button", { name: "Cari" }));
    expect(mocks.replace).not.toHaveBeenCalled();
    type("B123"); await wait(vehicleSearchDebounceMs);
    fireEvent.submit(input().closest("form")!);
    expect(hrefs()).toEqual(["/app/kendaraan?q=B123"]);
  });
});

describe("race conditions", () => {
  it("only the newest query is requested last, and a stale result never overwrites the input", async () => {
    const view = render(<VehicleSearch status="active" type="all" />);
    type("B1"); await wait(vehicleSearchDebounceMs);
    type("B12"); fireEvent.submit(input().closest("form")!);
    await wait(vehicleSearchDebounceMs);
    expect(hrefs()).toEqual(["/app/kendaraan?q=B1", "/app/kendaraan?q=B12"]);
    // The older "B1" response arrives late: the input keeps what the user typed.
    view.rerender(<VehicleSearch q="B1" status="active" type="all" />);
    expect(input().value).toBe("B12");
    expect(mocks.replace).toHaveBeenCalledTimes(2);
    view.rerender(<VehicleSearch q="B12" status="active" type="all" />);
    expect(input().value).toBe("B12");
  });
  it("typing continues undisturbed when an earlier debounced result lands", async () => {
    const view = render(<VehicleSearch status="active" type="all" />);
    type("B1"); await wait(vehicleSearchDebounceMs);
    type("B12");
    view.rerender(<VehicleSearch q="B1" status="active" type="all" />);
    expect(input().value).toBe("B12");
  });
  it("syncs the input after an external navigation (e.g. 'Hapus filter' link)", async () => {
    const view = render(<VehicleSearch q="B12" status="completed" type="all" />);
    view.rerender(<VehicleSearch status="active" type="all" />);
    expect(input().value).toBe("");
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("unmount cancels a pending debounce", async () => {
    const view = render(<VehicleSearch status="active" type="all" />);
    type("B9"); view.unmount(); await wait(vehicleSearchDebounceMs);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

it("keeps the no-JS GET form and an accessible status region", () => {
  render(<VehicleSearch q="B1" status="all" type="motor" />);
  const form = input().closest("form")!;
  expect(form.getAttribute("action")).toBe("/app/kendaraan"); expect(form.getAttribute("method")).toBe("get");
  expect((form.querySelector('input[name="status"]') as HTMLInputElement).value).toBe("all");
  expect((form.querySelector('input[name="type"]') as HTMLInputElement).value).toBe("motor");
  expect(screen.getByRole("status")).toBeTruthy();
});

it("exit target searches active vehicles at /app/kendaraan/keluar (no list filters)", async () => {
  render(<VehicleSearch target="exit" status="completed" type="motor" />);
  type("b 1"); fireEvent.submit(input().closest("form")!);
  expect(hrefs()).toEqual(["/app/kendaraan/keluar?q=b+1"]);
  const form = input().closest("form")!;
  expect(form.getAttribute("action")).toBe("/app/kendaraan/keluar");
  expect(form.querySelector('input[name="status"]')).toBeNull(); expect(form.querySelector('input[name="type"]')).toBeNull();
});
