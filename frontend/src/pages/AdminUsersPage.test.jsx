import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("keeps the selected role results when an earlier directory request finishes later", async () => {
    let finishFirst;
    const firstRequest = new Promise(resolve => { finishFirst = resolve; });
    getAdminUsers.mockResolvedValueOnce(firstRequest).mockResolvedValueOnce({
      users: [{ ...account, _id: "vendor-1", name: "Business Partner", role: "vendor" }], pagination: { page: 1, pages: 1 }
    });
    render(<AdminUsersPage />);
    fireEvent.change(screen.getByLabelText("Account role"), { target: { value: "vendor" } });
    expect(await screen.findByText("Business Partner")).toBeInTheDocument();
    await act(async () => {
      finishFirst({ users: [account], pagination: { page: 1, pages: 1 } });
      await firstRequest;
    });
    expect(screen.getByLabelText("Account role")).toHaveValue("vendor");
    expect(screen.getByText("Business Partner")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Customer" })).not.toBeInTheDocument();
  });

  it("holds the account filter while a suspension is being saved", async () => {
    let finishSuspension;
    const suspension = new Promise(resolve => { finishSuspension = resolve; });
    setUserSuspension.mockResolvedValueOnce(suspension);
    render(<AdminUsersPage />);
    fireEvent.change(await screen.findByLabelText("Suspension reason"), { target: { value: "Repeated abusive requests." } });
    fireEvent.click(screen.getByRole("button", { name: "Suspend account" }));
    expect(screen.getByLabelText("Account role")).toBeDisabled();
    await act(async () => { finishSuspension({ ...account, suspendedAt: "2026-10-19" }); await suspension; });
    await waitFor(() => expect(screen.getByLabelText("Account role")).toBeEnabled());
  });
});
