// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../components/theme-switcher", () => ({ ThemeSwitcher: () => null }));
import OwnerAppError from "./error";

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);
const secretError = () => Object.assign(new Error("synthetic-secret mongodb+srv://u:p@cluster0.example.mongodb.net tednco_parkir_provision_dev"), { stack: "at synthetic-secret.ts:1", digest: "4021538176" });

describe("Owner app error boundary", () => {
  it("shows an Indonesian fallback without internal details, and a working 'Coba lagi'", () => {
    const retry = vi.fn();
    const { container } = render(<OwnerAppError error={secretError()} retry={retry} />);
    expect(screen.getByRole("heading", { name: "Halaman belum dapat ditampilkan" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/synthetic|mongodb|cluster0|tednco_parkir_provision_dev|stack/);
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Kembali ke Beranda" }).getAttribute("href")).toBe("/app");
  });
  it("never claims that an operation succeeded or failed; asks to check first", () => {
    const { container } = render(<OwnerAppError error={new Error("x")} retry={vi.fn()} />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/periksa hasilnya .* sebelum mengulanginya/);
    expect(text).not.toMatch(/berhasil|gagal disimpan|tidak tersimpan|belum tercatat|sudah tercatat/i);
  });
  it("shows only a safe digest as reference code, ignoring unsafe or non-Error values", () => {
    render(<OwnerAppError error={secretError()} retry={vi.fn()} />);
    expect(screen.getByText("4021538176")).toBeTruthy();
    cleanup();
    const { container } = render(<OwnerAppError error={Object.assign(new Error("x"), { digest: "<script>synthetic</script>" })} retry={vi.fn()} />);
    expect(container.textContent).not.toMatch(/Kode referensi|synthetic/);
    cleanup();
    expect(() => render(<OwnerAppError error="thrown string synthetic" retry={vi.fn()} />)).not.toThrow();
    expect(screen.queryByText(/synthetic/)).toBeNull();
  });
});
