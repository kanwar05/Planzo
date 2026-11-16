import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VendorProfilePage from "./VendorProfilePage";
import { createVendorProfile, getMyVendorProfile, updateVendorProfile } from "../services/vendorService";
import { deleteCoverImage, deletePortfolioImage, deleteProfileImage, uploadCoverImage, uploadPortfolioImages, uploadProfileImage } from "../services/uploadService";

vi.mock("../services/vendorService", () => ({ getMyVendorProfile: vi.fn(), createVendorProfile: vi.fn(), updateVendorProfile: vi.fn() }));
vi.mock("../services/uploadService", () => ({ deletePortfolioImage: vi.fn(), uploadPortfolioImages: vi.fn(), uploadProfileImage: vi.fn(), uploadCoverImage: vi.fn(), deleteProfileImage: vi.fn(), deleteCoverImage: vi.fn() }));

const photo = "https://example.test/portfolio.jpg";
const profile = {
  _id: "vendor-1", businessName: "Event Studio", serviceCategory: "Decoration", description: "Thoughtful event decoration",
  location: "Delhi", city: "Delhi", serviceAreas: ["Delhi", "Noida"], profileRevision: 3, pricing: 10000, servicesOffered: ["Wedding decoration"], verificationStatus: "approved", portfolioImages: [photo],
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
      businessName: "Event Studio", serviceCategory: "Decoration", description: "Thoughtful event decoration", location: "Delhi", city: "Delhi", serviceAreas: ["Delhi", "Noida"], profileRevision: 3, pricing: 10000,
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

  it("creates a complete onboarding profile with a zero starting price and optional coverage", async () => {
    getMyVendorProfile.mockRejectedValueOnce({ response: { status: 404 } });
    createVendorProfile.mockResolvedValueOnce({ ...profile, pricing: 0, verificationStatus: "pending" });
    render(<MemoryRouter><VendorProfilePage /></MemoryRouter>);
    const name = await screen.findByLabelText("Business name");
    expect(screen.getByRole("progressbar", { name: "Essential profile completion" })).toHaveAttribute("value", "0");
    fireEvent.change(name, { target: { value: "Event Studio" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Decoration" } });
    fireEvent.change(screen.getByLabelText("Service location"), { target: { value: "Delhi event district" } });
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Delhi" } });
    fireEvent.change(screen.getByLabelText("Starting price (INR)"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Business description"), { target: { value: "Thoughtful event decoration" } });
    fireEvent.change(screen.getByLabelText("Service coverage areas (optional)"), { target: { value: " Delhi \n Noida \nDelhi\n" } });
    expect(screen.getByRole("progressbar", { name: "Essential profile completion" })).toHaveAttribute("value", "100");
    fireEvent.click(screen.getByRole("button", { name: "Save business profile" }));
    await waitFor(() => expect(createVendorProfile).toHaveBeenCalledWith(expect.objectContaining({
      businessName: "Event Studio", location: "Delhi event district", city: "Delhi", pricing: 0, serviceAreas: ["Delhi", "Noida"]
    })));
    expect(createVendorProfile.mock.calls[0][0]).not.toHaveProperty("profileRevision");
    expect(await screen.findByText("Profile saved and submitted for review.")).toBeInTheDocument();
  });

  it("previews current unsaved public details without exposing contacts or publishing a pending profile", async () => {
    getMyVendorProfile.mockResolvedValueOnce({ ...profile, verificationStatus: "pending" });
    render(<MemoryRouter><VendorProfilePage /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("Business name"), { target: { value: "New unsaved business name" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview profile" }));
    const preview = screen.getByRole("dialog", { name: "Profile preview" });
    expect(within(preview).getByRole("heading", { name: "New unsaved business name" })).toBeInTheDocument();
    expect(within(preview).getByText(/Delhi, Noida/)).toBeInTheDocument();
    expect(preview).not.toHaveTextContent(profile.contactDetails.email);
    expect(preview).not.toHaveTextContent(profile.contactDetails.phone);
    expect(within(preview).queryByRole("link")).not.toBeInTheDocument();
    expect(updateVendorProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "View public profile" })).not.toBeInTheDocument();
  });

  it("shows rejection feedback and submits corrections using the current profile revision", async () => {
    getMyVendorProfile.mockResolvedValueOnce({ ...profile, verificationStatus: "rejected", verificationRejectionReason: "Clarify the service location." });
    updateVendorProfile.mockResolvedValueOnce({ ...profile, verificationStatus: "pending", verificationRejectionReason: "", profileRevision: 4 });
    render(<MemoryRouter><VendorProfilePage /></MemoryRouter>);
    expect(await screen.findByText("Clarify the service location.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Service location"), { target: { value: "Delhi, Connaught Place" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and resubmit for review" }));
    await waitFor(() => expect(updateVendorProfile).toHaveBeenCalledWith(expect.objectContaining({ profileRevision: 3, location: "Delhi, Connaught Place" })));
    expect(await screen.findByText("Profile resubmitted for review.")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.queryByText("Clarify the service location.")).not.toBeInTheDocument();
  });

  it("uses the server's review status after material edits and keeps older revisionless profiles editable", async () => {
    const legacy = { ...profile, profileRevision: undefined, city: undefined, serviceAreas: undefined };
    getMyVendorProfile.mockResolvedValueOnce(legacy);
    updateVendorProfile.mockResolvedValueOnce({ ...profile, businessName: "New studio", verificationStatus: "pending" });
    render(<MemoryRouter><VendorProfilePage /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("Business name"), { target: { value: "New studio" } });
    fireEvent.click(screen.getByRole("button", { name: "Save business profile" }));
    await waitFor(() => expect(updateVendorProfile).toHaveBeenCalled());
    expect(updateVendorProfile.mock.calls[0][0]).not.toHaveProperty("profileRevision");
    expect(updateVendorProfile.mock.calls[0][0].city).toBe("Delhi");
    expect(await screen.findByText("pending")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View public profile" })).not.toBeInTheDocument();
  });

  it.each([["Profile", "profileImage", uploadProfileImage], ["Cover", "coverImage", uploadCoverImage]])("uploads a %s photo and preserves unsaved form edits", async (label, kind, uploadImage) => {
    const uploaded = "https://example.test/uploaded.jpg";
    uploadImage.mockResolvedValueOnce({ ...profile, [kind]: { url: uploaded }, verificationStatus: "pending", profileRevision: 4 });
    render(<MemoryRouter><VendorProfilePage /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("Business name"), { target: { value: "Unsaved studio" } });
    const file = new File(["image"], "business.webp", { type: "image/webp" });
    fireEvent.change(screen.getByLabelText(`${label} photo`), { target: { files: [file] } });
    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith(file));
    expect(await screen.findByAltText(`${label} photo for Event Studio`)).toHaveAttribute("src", uploaded);
    expect(screen.getByLabelText("Business name")).toHaveValue("Unsaved studio");
    expect(screen.getByText("pending")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save business profile" }));
    await waitFor(() => expect(updateVendorProfile).toHaveBeenCalledWith(expect.objectContaining({ profileRevision: 4, businessName: "Unsaved studio" })));
  });

  it("keeps the form revision stale when an image response contains business changes from another tab", async () => {
    uploadProfileImage.mockResolvedValueOnce({ ...profile, businessName: "Changed in another tab", description: "New description saved elsewhere", profileImage: { url: photo }, profileRevision: 5 });
    updateVendorProfile.mockRejectedValueOnce({ response: { status: 409, data: { message: "The profile changed. Reload before saving." } } });
    render(<MemoryRouter><VendorProfilePage /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("Business name"), { target: { value: "My unsaved form edit" } });
    fireEvent.change(screen.getByLabelText("Profile photo"), { target: { files: [new File(["image"], "photo.webp", { type: "image/webp" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Your saved business details changed");
    expect(screen.getByLabelText("Business name")).toHaveValue("My unsaved form edit");
    expect(screen.getByLabelText("Business description")).toHaveValue(profile.description);
    fireEvent.click(screen.getByRole("button", { name: "Save business profile" }));
    await waitFor(() => expect(updateVendorProfile).toHaveBeenCalledWith(expect.objectContaining({ profileRevision: 3, businessName: "My unsaved form edit", description: profile.description })));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reload before saving");
    expect(screen.getByRole("button", { name: "Reload saved profile" })).toBeInTheDocument();
  });

  it.each([["profile", "profileImage", deleteProfileImage], ["cover", "coverImage", deleteCoverImage]])("confirms %s photo removal before calling its owner endpoint", async (label, kind, deleteImage) => {
    getMyVendorProfile.mockResolvedValueOnce({ ...profile, [kind]: { url: photo } });
    deleteImage.mockResolvedValueOnce({ ...profile, [kind]: null, verificationStatus: "pending" });
    render(<MemoryRouter><VendorProfilePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: `Remove ${label} photo` }));
    expect(deleteImage).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: `Remove ${label} photo?` });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove photo" }));
    await waitFor(() => expect(deleteImage).toHaveBeenCalledWith());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("rejects oversized branding photos and excessive service areas before sending requests", async () => {
    render(<MemoryRouter><VendorProfilePage /></MemoryRouter>);
    const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" });
    fireEvent.change(await screen.findByLabelText("Profile photo"), { target: { files: [file] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("up to 5 MB");
    expect(uploadProfileImage).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Service coverage areas (optional)"), { target: { value: Array.from({ length: 21 }, (_, index) => `Area ${index}`).join("\n") } });
    fireEvent.click(screen.getByRole("button", { name: "Save business profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("up to 20 service areas");
    expect(updateVendorProfile).not.toHaveBeenCalled();
  });

  it("offers an explicit reload after a concurrent revision conflict while preserving the user's edits", async () => {
    updateVendorProfile.mockRejectedValueOnce({ response: { status: 409, data: { message: "The profile changed. Reload before saving." } } });
    render(<MemoryRouter><VendorProfilePage /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("Business name"), { target: { value: "My changes" } });
    fireEvent.click(screen.getByRole("button", { name: "Save business profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reload before saving");
    expect(screen.getByLabelText("Business name")).toHaveValue("My changes");
    fireEvent.click(screen.getByRole("button", { name: "Reload saved profile" }));
    await waitFor(() => expect(getMyVendorProfile).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText("Business name")).toHaveValue("Event Studio");
  });
});
