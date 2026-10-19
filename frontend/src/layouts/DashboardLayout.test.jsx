import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardLayout from "./DashboardLayout";
import { useAuth } from "../context/AuthContext";

vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));

const renderWorkspace = (path = "/vendor/dashboard") => render(<MemoryRouter initialEntries={[path]}>
  <Routes>
    <Route element={<DashboardLayout />}>
      <Route path="/vendor/dashboard" element={<h1>Vendor bookings</h1>} />
      <Route path="/vendor/availability" element={<h1>Vendor calendar</h1>} />
      <Route path="/admin" element={<h1>Admin overview</h1>} />
    </Route>
    <Route path="/login" element={<h1>Sign in</h1>} />
  </Routes>
</MemoryRouter>);

describe("responsive workspace navigation", () => {
  let logout;
  beforeEach(() => {
    logout = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ user: { name: "Event Partner", role: "vendor" }, isAuthenticated: true, logout });
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation(query => ({
      matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn()
    })));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("traps mobile menu focus, closes with Escape, and restores focus and scrolling", () => {
    renderWorkspace();
    const trigger = screen.getByRole("button", { name: "Open sidebar" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Partner workspace" });
    const first = within(dialog).getByRole("link", { name: "Planzo home" });
    const last = within(dialog).getByRole("button", { name: "Log out" });
    expect(first).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(document.body.style.overflow).toBe("hidden");
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps role navigation intact and closes the mobile menu after navigation", async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Open sidebar" }));
    const navigation = within(screen.getByRole("dialog"));
    expect(navigation.getByRole("link", { name: "Business profile" })).toHaveAttribute("href", "/vendor/profile-setup");
    expect(navigation.queryByRole("link", { name: "Vendor approvals" })).not.toBeInTheDocument();
    fireEvent.click(navigation.getByRole("link", { name: "Availability" }));
    expect(await screen.findByRole("heading", { name: "Vendor calendar" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

  it("shows admin routes and keeps logout errors recoverable", async () => {
    logout.mockRejectedValueOnce(new Error("Network unavailable"));
    useAuth.mockReturnValue({ user: { name: "Admin", role: "admin" }, isAuthenticated: true, logout });
    renderWorkspace("/admin");
    fireEvent.click(screen.getByRole("button", { name: "Open sidebar" }));
    const navigation = within(screen.getByRole("dialog", { name: "Admin workspace" }));
    expect(navigation.getByRole("link", { name: "Vendor approvals" })).toHaveAttribute("href", "/admin/vendors/unverified");
    fireEvent.click(navigation.getByRole("button", { name: "Log out" }));
    expect(await navigation.findByRole("alert")).toHaveTextContent("Unable to log out. Please try again.");
    expect(screen.getByText("Admin overview")).toBeInTheDocument();
    fireEvent.click(navigation.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument());
    expect(logout).toHaveBeenCalledTimes(2);
  });
});
