import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import * as authService from "../services/authService";

vi.mock("../services/authService", () => ({
  getMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn()
}));

let account;
function Session() {
  account = useAuth();
  return <p>{account.loading ? "Checking session" : account.user?.name || "Guest"}</p>;
}
const renderSession = () => render(<AuthProvider><Session /></AuthProvider>);

describe("account session loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  it("uses the shared cookie session for password login", async () => {
    authService.getMe.mockResolvedValue(null);
    const customer = { id: "existing-account", name: "Aditi", email: "aditi@example.test", role: "customer" };
    authService.login.mockResolvedValue(customer);
    renderSession();
    await screen.findByText("Guest");
    await act(async () => { await account.login({ email: customer.email, password: "Password1!" }); });
    expect(account.isAuthenticated).toBe(true);
  });

  it("keeps session loading until the cookie-backed identity has resolved", async () => {
    let resolveSession;
    authService.getMe.mockReturnValue(new Promise(resolve => { resolveSession = resolve; }));
    renderSession();
    expect(screen.getByText("Checking session")).toBeInTheDocument();
    await waitFor(() => expect(authService.getMe).toHaveBeenCalledOnce());
    await act(async () => resolveSession({ name: "Aditi", role: "customer" }));
    expect(screen.getByText("Aditi")).toBeInTheDocument();
    expect(account.isAuthenticated).toBe(true);
    act(() => window.dispatchEvent(new Event("planzo:session-expired")));
    expect(screen.getByText("Guest")).toBeInTheDocument();
    expect(account.isAuthenticated).toBe(false);
  });

  it("recovers as a guest without trusting the former local user cache", async () => {
    localStorage.setItem("Planzo_user", JSON.stringify({ role: "admin", name: "Cached user" }));
    authService.getMe.mockRejectedValue(new Error("Session unavailable"));
    renderSession();
    expect(await screen.findByText("Guest")).toBeInTheDocument();
    expect(account.isAuthenticated).toBe(false);
    expect(localStorage.getItem("Planzo_user")).toBeNull();
  });

  it("preserves the account when logout fails and clears it after a successful retry", async () => {
    authService.getMe.mockResolvedValue(null);
    authService.login.mockResolvedValue({ name: "Aditi", role: "customer" });
    authService.logout.mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce({});
    renderSession();
    await screen.findByText("Guest");
    const credentials = { email: "aditi@example.test", password: "Password1!" };
    await act(async () => { await account.login(credentials); });
    expect(authService.login).toHaveBeenCalledWith(credentials);
    expect(screen.getByText("Aditi")).toBeInTheDocument();
    await act(async () => { await expect(account.logout()).rejects.toThrow("Connection lost"); });
    expect(account.isAuthenticated).toBe(true);
    await act(async () => { await account.logout(); });
    expect(screen.getByText("Guest")).toBeInTheDocument();
  });

  it("returns the actual registered account after loading the service", async () => {
    authService.getMe.mockResolvedValue(null);
    const vendor = { name: "Event Studio", role: "vendor" };
    authService.register.mockResolvedValue(vendor);
    renderSession();
    await screen.findByText("Guest");
    await act(async () => { expect(await account.register(vendor)).toEqual(vendor); });
    expect(account.user).toEqual(vendor);
    expect(authService.register).toHaveBeenCalledWith(vendor);
  });
});
