import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./SettingsPage";

const updateUser = vi.fn();
const updateProfile = vi.fn();
const updateSettings = vi.fn();

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { name: "Planzo User", email: "user@planzo.test", phone: "9999999991", role: "customer" },
    updateUser,
  }),
}));
vi.mock("../services/authService", () => ({
  changePassword: vi.fn(),
  updateProfile: (...args) => updateProfile(...args),
}));
vi.mock("../services/settingsService", () => ({
  getSettings: vi.fn().mockResolvedValue({
    notifications: { bookingUpdates: true, reviewReminders: true, promotions: false, productUpdates: true },
    email: { enabled: true, bookingUpdates: true, promotions: false, newsletter: false },
    sms: { enabled: true, bookingUpdates: true, securityAlerts: true, promotions: false },
    privacy: { profileVisibility: "members", showOnlineStatus: true, allowSearchEngines: false, dataPersonalization: true },
    theme: { mode: "system", reducedMotion: false },
  }),
  getSessions: vi.fn().mockResolvedValue([]),
  updateSettings: (...args) => updateSettings(...args),
  revokeSession: vi.fn(), revokeOtherSessions: vi.fn(),
  deactivateAccount: vi.fn(), deleteAccount: vi.fn(),
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateProfile.mockResolvedValue({ name: "Updated User", email: "user@planzo.test", phone: "9999999991" });
  });

  it("renders all account setting tabs and saves a validated profile", async () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Profile information" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Devices & sessions/ })).toBeInTheDocument();
    const name = screen.getByLabelText("Full name");
    fireEvent.change(name, { target: { value: "Updated User" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({
      name: "Updated User", email: "user@planzo.test", phone: "9999999991",
    }));
    expect(updateUser).toHaveBeenCalled();
  });

  it("shows client validation errors before submitting an invalid profile", async () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Profile information" });
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Name must contain at least 2 characters.")).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
