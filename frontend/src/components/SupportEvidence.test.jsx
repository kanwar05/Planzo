import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SupportEvidence from "./SupportEvidence";
import { getSupportEvidence, uploadSupportEvidence } from "../services/supportService";
vi.mock("../services/supportService", () => ({ getSupportEvidence: vi.fn(), uploadSupportEvidence: vi.fn() }));
const caseId = "c".repeat(24), evidenceId = "e".repeat(24);
const record = { revision: 4, evidence: [{ evidenceId, format: "png", bytes: 100, uploaderRole: "customer" }] };
const perform = (kind, operation) => operation();
describe("private support evidence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    URL.createObjectURL = vi.fn(() => "blob:private-evidence"); URL.revokeObjectURL = vi.fn();
  });
  it("rejects unsupported file types before an upload starts", () => {
    render(<SupportEvidence caseId={caseId} record={record} canUpload perform={perform} />);
    fireEvent.change(screen.getByLabelText("Evidence images"), { target: { files: [new File(["text"], "note.pdf", { type: "application/pdf" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent("JPEG, PNG or WEBP");
    expect(uploadSupportEvidence).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Upload evidence" })).toBeDisabled();
  });
  it("reuses the same evidence operation key, files and inspected revision on an uncertain upload", async () => {
    uploadSupportEvidence.mockRejectedValueOnce(new Error("Upload response lost")).mockResolvedValueOnce({ case: record });
    const file = new File(["image"], "receipt.png", { type: "image/png" });
    render(<SupportEvidence caseId={caseId} record={record} canUpload perform={perform} />);
    fireEvent.change(screen.getByLabelText("Evidence images"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload evidence" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload response lost");
    expect(screen.getByLabelText("Evidence images")).toBeDisabled();
    const original = uploadSupportEvidence.mock.calls[0];
    expect(original).toEqual([caseId, [file], 4, expect.any(String)]);
    fireEvent.click(screen.getByRole("button", { name: "Upload evidence" }));
    await waitFor(() => expect(uploadSupportEvidence).toHaveBeenCalledTimes(2));
    expect(uploadSupportEvidence.mock.calls[1]).toEqual(original);
    await waitFor(() => expect(screen.getByLabelText("Evidence images")).toBeEnabled());
  });
  it("previews authorized bytes through a temporary Blob URL and revokes it on close", async () => {
    getSupportEvidence.mockResolvedValue(new Blob(["image bytes"], { type: "image/png" }));
    const { unmount } = render(<SupportEvidence caseId={caseId} record={record} canUpload={false} perform={perform} />);
    fireEvent.click(screen.getByRole("button", { name: "View evidence 1" }));
    const preview = await screen.findByRole("img", { name: "Support case evidence" });
    expect(getSupportEvidence).toHaveBeenCalledWith(caseId, evidenceId);
    expect(preview).toHaveAttribute("src", "blob:private-evidence");
    expect(preview.getAttribute("src")).not.toContain("cloudinary");
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:private-evidence"));
    fireEvent.click(screen.getByRole("button", { name: "View evidence 1" }));
    await screen.findByRole("img", { name: "Support case evidence" });
    unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
  it("does not create a preview URL for forbidden or non-image evidence responses", async () => {
    getSupportEvidence.mockResolvedValueOnce(new Blob(["<html>"], { type: "text/html" }));
    render(<SupportEvidence caseId={caseId} record={record} canUpload={false} perform={perform} />);
    fireEvent.click(screen.getByRole("button", { name: "View evidence 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not a supported image");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    getSupportEvidence.mockRejectedValueOnce({ response: { status: 403, data: { message: "Evidence is not accessible." } } });
    fireEvent.click(screen.getByRole("button", { name: "View evidence 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not accessible");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
