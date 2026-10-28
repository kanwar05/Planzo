import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./SettingsPage";
import { requestEmailChange, updateProfile } from "../services/authService";
const { updateUser } = vi.hoisted(() => ({ updateUser: vi.fn() }));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      name: "Planzo User",
      email: "user@example.test",
      phone: "9999999991",
      role: "customer"
    },
    updateUser
  })
}));
vi.mock("../services/authService", () => ({
  changePassword: vi.fn(),
  deactivateAccount: vi.fn(),
  requestEmailChange: vi.fn(),
  updateProfile: vi.fn()
}));
describe("account settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateProfile.mockResolvedValue({
      name: "Updated User",
      email: "user@example.test",
      phone: "9999999991"
    });
  });
  it("saves profile details without changing email directly", async () => {
    render(<MemoryRouter>
    <SettingsPage />
  </MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: {
        value: "Updated User"
      }
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Save profile"
    }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({
      name: "Updated User",
      phone: "9999999991"
    }));
    expect(updateUser).toHaveBeenCalled();
    expect(screen.getByLabelText("Current email")).toHaveAttribute("readonly");
  });
  it("requests verification and leaves the existing email unchanged", async () => {
    requestEmailChange.mockResolvedValue({
      message: "Verification link sent."
    });
    render(<MemoryRouter>
    <SettingsPage />
  </MemoryRouter>);
    fireEvent.change(screen.getByLabelText("New email address"), {
      target: {
        value: "new@example.test"
      }
    });
    fireEvent.change(screen.getByLabelText("Current password for email change"), {
      target: {
        value: "Password1!"
      }
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Send verification link"
    }));
    await waitFor(() => expect(requestEmailChange).toHaveBeenCalledWith({
      email: "new@example.test",
      currentPassword: "Password1!"
    }));
    expect(await screen.findByText("Verification link sent.")).toBeInTheDocument();
    expect(screen.getByLabelText("Current email")).toHaveValue("user@example.test");
  });
  it("rejects a name shorter than two characters", async () => {
    render(<MemoryRouter>
    <SettingsPage />
  </MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: {
        value: "X"
      }
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Save profile"
    }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Name must contain at least 2 characters.");
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
