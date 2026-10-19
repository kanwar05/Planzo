import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminVerifyVendorsPage from "./AdminVerifyVendorsPage";
import { getAdminVendors, reviewVendor } from "../services/adminService";
vi.mock("../services/adminService", () => ({
  getAdminVendors: vi.fn(),
  reviewVendor: vi.fn()
}));
const vendor = {
  _id: "vendor-1",
  businessName: "Event Studio",
  serviceCategory: "Decoration",
  location: "Delhi",
  pricing: 10000,
  verificationStatus: "pending",
  description: "Event decoration",
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
  });
  it("approves a pending business profile", async () => {
    render(<AdminVerifyVendorsPage />);
    fireEvent.click(await screen.findByRole("button", {
      name: "Approve vendor"
    }));
    await waitFor(() => expect(reviewVendor).toHaveBeenCalledWith("vendor-1", true, undefined));
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
    await waitFor(() => expect(reviewVendor).toHaveBeenCalledWith("vendor-1", false, "Please complete the business description."));
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
});
