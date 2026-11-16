import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminVerifyVendorsPage from "./AdminVerifyVendorsPage";
import { getAdminVendors, getVendorModerationAudit, reviewVendor, setVendorSuspension } from "../services/adminService";
vi.mock("../services/adminService", () => ({
  getAdminVendors: vi.fn(),
  reviewVendor: vi.fn(),
  setVendorSuspension: vi.fn(),
  getVendorModerationAudit: vi.fn()
}));
const vendor = {
  _id: "vendor-1",
  businessName: "Event Studio",
  serviceCategory: "Decoration",
  location: "Delhi",
  pricing: 10000,
  verificationStatus: "pending",
  description: "Event decoration",
  profileRevision: 4,
  profileCompletion: { percent: 100, readyForReview: true, missingFields: [] },
  userId: {
    name: "Vendor",
    email: "vendor@example.test"
  }
};
describe("admin vendor approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAdminVendors.mockResolvedValue({
      vendors: [vendor],
      pagination: {
        page: 1,
        pages: 1
      }
    });
    reviewVendor.mockResolvedValue(vendor);
    setVendorSuspension.mockResolvedValue({});
    getVendorModerationAudit.mockResolvedValue({ records: [], pagination: { page: 1, pages: 1 } });
  });
  it("approves a pending business profile", async () => {
    render(<AdminVerifyVendorsPage />);
    fireEvent.click(await screen.findByRole("button", {
      name: "Approve vendor"
    }));
    await waitFor(() => expect(reviewVendor).toHaveBeenCalledWith("vendor-1", true, undefined, 4));
  });
  it("requires and submits a rejection reason", async () => {
    render(<AdminVerifyVendorsPage />);
    fireEvent.click(await screen.findByRole("button", {
      name: "Reject vendor"
    }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Provide a reason");
    expect(reviewVendor).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Review reason (required for rejection)"), {
      target: {
        value: "Please complete the business description."
      }
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Reject vendor"
    }));
    await waitFor(() => expect(reviewVendor).toHaveBeenCalledWith("vendor-1", false, "Please complete the business description.", 4));
  });

  it("does not replace the current approval filter with an older response", async () => {
    let finishFirst;
    const firstRequest = new Promise(resolve => { finishFirst = resolve; });
    getAdminVendors.mockResolvedValueOnce(firstRequest).mockResolvedValueOnce({
      vendors: [{ ...vendor, _id: "approved-1", businessName: "Approved Studio", verificationStatus: "approved" }], pagination: { page: 1, pages: 1 }
    });
    render(<AdminVerifyVendorsPage />);
    fireEvent.change(screen.getByLabelText("Approval status"), { target: { value: "approved" } });
    expect(await screen.findByText("Approved Studio")).toBeInTheDocument();
    await act(async () => {
      finishFirst({ vendors: [vendor], pagination: { page: 1, pages: 1 } });
      await firstRequest;
    });
    expect(screen.getByLabelText("Approval status")).toHaveValue("approved");
    expect(screen.getByText("Approved Studio")).toBeInTheDocument();
    expect(screen.queryByText("Event Studio")).not.toBeInTheDocument();
  });

  it("searches listings with the selected access filter", async () => {
    render(<AdminVerifyVendorsPage />);
    await screen.findByText("Event Studio");
    fireEvent.change(screen.getByLabelText("Search vendor listings"), { target: { value: "Delhi decor" } });
    fireEvent.change(screen.getByLabelText("Listing access"), { target: { value: "true" } });
    fireEvent.click(screen.getByRole("button", { name: "Search listings" }));
    await waitFor(() => expect(getAdminVendors).toHaveBeenLastCalledWith({
      status: "pending", suspended: "true", search: "Delhi decor", page: 1, limit: 8,
    }));
  });

  it("blocks approval for incomplete profile information", async () => {
    getAdminVendors.mockResolvedValue({ vendors: [{ ...vendor, profileCompletion: {
      percent: 80, readyForReview: false, missingFields: ["description"],
    } }], pagination: { page: 1, pages: 1 } });
    render(<AdminVerifyVendorsPage />);
    expect(await screen.findByRole("button", { name: "Approve vendor" })).toBeDisabled();
    expect(screen.getByText(/Missing: description/)).toBeInTheDocument();
    expect(reviewVendor).not.toHaveBeenCalled();
  });

  it("requires a suspension reason and submits the inspected revision", async () => {
    render(<AdminVerifyVendorsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Suspend vendor account" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm suspension" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Provide a reason");
    expect(setVendorSuspension).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Moderation reason"), { target: { value: "Repeated inaccurate listings." } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm suspension" }));
    await waitFor(() => expect(setVendorSuspension).toHaveBeenCalledWith("vendor-1", true, "Repeated inaccurate listings.", 4));
  });

  it("restores suspended vendors without approving the listing", async () => {
    getAdminVendors.mockResolvedValue({ vendors: [{ ...vendor, suspended: true }], pagination: { page: 1, pages: 1 } });
    render(<AdminVerifyVendorsPage />);
    expect(await screen.findByRole("button", { name: "Approve vendor" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Restore vendor account" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm restoration" }));
    await waitFor(() => expect(setVendorSuspension).toHaveBeenCalledWith("vendor-1", false, "", 4));
    expect(reviewVendor).not.toHaveBeenCalled();
  });

  it("shows moderation history using its protected listing endpoint", async () => {
    getVendorModerationAudit.mockResolvedValue({ records: [{
      _id: "audit-1", action: "reject", actorId: { name: "Administrator" },
      createdAt: "2028-01-01T12:00:00Z", reason: "Please add a clear business description.",
    }], pagination: { page: 1, pages: 1 } });
    render(<AdminVerifyVendorsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "View moderation history" }));
    expect(await screen.findByText("Please add a clear business description.")).toBeInTheDocument();
    expect(getVendorModerationAudit).toHaveBeenCalledWith("vendor-1", { page: 1, limit: 10 });
    expect(screen.getByText("Listing rejected")).toBeInTheDocument();
  });

  it("surfaces stale-profile feedback and allows inspection to be refreshed", async () => {
    reviewVendor.mockRejectedValueOnce({ response: { status: 409, data: { message: "The profile changed. Refresh and inspect it before deciding." } } });
    render(<AdminVerifyVendorsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve vendor" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The profile changed");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(getAdminVendors).toHaveBeenCalledTimes(2));
  });
});
