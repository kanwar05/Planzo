import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminUsersPage from "./AdminUsersPage";
import { getAdminUsers, setUserSuspension } from "../services/adminService";
vi.mock("../services/adminService", () => ({
  getAdminUsers: vi.fn(),
  setUserSuspension: vi.fn()
}));
const account = {
  _id: "customer-1",
  name: "Customer",
  email: "customer@example.test",
  role: "customer",
  accountStatus: "active",
  suspendedAt: null
};
describe("admin user suspension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAdminUsers.mockResolvedValue({
      users: [account],
      pagination: {
        page: 1,
        pages: 1
      }
    });
  });
  it("requires an explanation before suspending an account", async () => {
    render(<AdminUsersPage />);
    fireEvent.click(await screen.findByRole("button", {
      name: "Suspend account"
    }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Provide a reason for suspending this account.");
    expect(setUserSuspension).not.toHaveBeenCalled();
  });
  it("sends suspension with the admin's explanation", async () => {
    setUserSuspension.mockResolvedValue({
      ...account,
      suspendedAt: "2026-10-18"
    });
    render(<AdminUsersPage />);
    fireEvent.change(await screen.findByLabelText("Suspension reason"), {
      target: {
        value: "Repeated abusive requests."
      }
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Suspend account"
    }));
    await waitFor(() => expect(setUserSuspension).toHaveBeenCalledWith("customer-1", true, "Repeated abusive requests."));
  });
});
