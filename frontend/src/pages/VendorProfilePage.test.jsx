import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VendorProfilePage from "./VendorProfilePage";
import { getMyVendorProfile, updateVendorProfile } from "../services/vendorService";
import { deletePortfolioImage, uploadPortfolioImages } from "../services/uploadService";

vi.mock("../services/vendorService", () => ({ getMyVendorProfile: vi.fn(), createVendorProfile: vi.fn(), updateVendorProfile: vi.fn() }));
vi.mock("../services/uploadService", () => ({ deletePortfolioImage: vi.fn(), uploadPortfolioImages: vi.fn() }));

const photo = "https://example.test/portfolio.jpg";
const profile = {
  _id: "vendor-1", businessName: "Event Studio", serviceCategory: "Decoration", description: "Thoughtful event decoration",
  location: "Delhi", pricing: 10000, servicesOffered: ["Wedding decoration"], verificationStatus: "approved", portfolioImages: [photo],
  contactDetails: { phone: "+919999999999", email: "business@example.test" }
};

describe("business profile editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMyVendorProfile.mockResolvedValue(profile);
    deletePortfolioImage.mockResolvedValue({ ...profile, portfolioImages: [] });
    updateVendorProfile.mockResolvedValue(profile);
  });

  it("keeps the full business and private contact payload when saving", async () => {
    render(<MemoryRouter><VendorProfilePage /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("Services offered"), { target: { value: " Wedding decoration \n\n Floral styling " } });
    fireEvent.click(screen.getByRole("button", { name: "Save business profile" }));
    await waitFor(() => expect(updateVendorProfile).toHaveBeenCalledWith({
      businessName: "Event Studio", serviceCategory: "Decoration", description: "Thoughtful event decoration", location: "Delhi", pricing: 10000,
      servicesOffered: ["Wedding decoration", "Floral styling"], contactDetails: { phone: "+919999999999", email: "business@example.test" }
    }));
  });

  it("confirms portfolio removal before sending the original image URL", async () => {
    render(<MemoryRouter><VendorProfilePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Remove photo 1" }));
    const dialog = screen.getByRole("dialog", { name: "Remove this photo?" });
    expect(deletePortfolioImage).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove photo" }));
    await waitFor(() => expect(deletePortfolioImage).toHaveBeenCalledWith(photo));
    expect(await screen.findByText("No business photos uploaded yet.")).toBeInTheDocument();
  });

  it("rejects unsupported files before uploading", async () => {
    render(<MemoryRouter><VendorProfilePage /></MemoryRouter>);
    const input = await screen.findByLabelText("Choose photos");
    fireEvent.change(input, { target: { files: [new File(["document"], "plan.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Use JPEG, PNG, or WebP photos up to 5 MB each.");
    expect(uploadPortfolioImages).not.toHaveBeenCalled();
  });

  it("recovers from a profile load failure without leaving the editor", async () => {
    getMyVendorProfile.mockRejectedValueOnce(new Error("Connection interrupted."));
    render(<MemoryRouter><VendorProfilePage /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Connection interrupted.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Business name")).toHaveValue("Event Studio");
    expect(getMyVendorProfile).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps failed-save feedback beside the save action and preserves entered details", async () => {
    updateVendorProfile.mockRejectedValueOnce(new Error("Unable to save these changes."));
    render(<MemoryRouter><VendorProfilePage /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("Business name"), { target: { value: "Event Studio Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save business profile" }));
    const form = screen.getByRole("form", { name: "Business profile" });
    expect(await within(form).findByRole("alert")).toHaveTextContent("Unable to save these changes.");
    expect(screen.getByLabelText("Business name")).toHaveValue("Event Studio Updated");
    expect(screen.getByRole("button", { name: "Save business profile" })).toBeEnabled();
  });
});
