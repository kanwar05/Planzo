import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BookingSupportPage from "./BookingSupportPage";
import SupportCasePage from "./SupportCasePage";
import AdminSupportCasesPage from "./AdminSupportCasesPage";
import AdminCancellationPoliciesPage from "./AdminCancellationPoliciesPage";
import { addPrivateSupportNote, addSupportUpdate, createSupportCase, getAdminSupportCases, getBookingSupportCases, getSupportCase, getSupportEvents, manageSupportCase } from "../services/supportService";
import { getCancellationPolicies, publishCancellationPolicy } from "../services/cancellationPolicyService";
const auth = vi.hoisted(() => ({ user: { _id: "a".repeat(24), role: "customer", emailVerified: true } }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../services/supportService", () => ({ addPrivateSupportNote: vi.fn(), addSupportUpdate: vi.fn(), createSupportCase: vi.fn(), getAdminSupportCases: vi.fn(), getBookingSupportCases: vi.fn(), getSupportCase: vi.fn(), getSupportEvents: vi.fn(), manageSupportCase: vi.fn(), getSupportEvidence: vi.fn(), uploadSupportEvidence: vi.fn() }));
vi.mock("../services/cancellationPolicyService", () => ({ getCancellationPolicies: vi.fn(), publishCancellationPolicy: vi.fn() }));
const bookingId = "b".repeat(24), caseId = "c".repeat(24);
const record = { _id: caseId, bookingId, category: "service_quality", subject: "Service concern", description: "The agreed floral arrangement was not delivered.", status: "open", revision: 1, assigned: false, evidence: [] };
const booking = { _id: bookingId, status: "accepted", eventType: "Wedding", eventDate: "2099-04-01", eventLocation: "Garden" };
const opened = { _id: "event-1", sequence: 1, kind: "created", actorRole: "customer", body: "Case opened for review", createdAt: "2026-11-16T10:00:00Z" };
const renderPage = (Component, path = `/support/cases/${caseId}`, route = "/support/cases/:caseId") => render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={<Component />} /></Routes></MemoryRouter>);
describe("booking support interfaces", () => {
  beforeEach(() => {
    vi.resetAllMocks(); auth.user = { _id: "a".repeat(24), role: "customer", emailVerified: true };
    getBookingSupportCases.mockResolvedValue([]);
    getSupportCase.mockResolvedValue({ case: record, booking });
    getSupportEvents.mockResolvedValue({ events: [opened], pagination: { hasMore: false } });
  });
  it("opens one case with a frozen key and payload after an uncertain response", async () => {
    createSupportCase.mockRejectedValueOnce(new Error("Response lost")).mockResolvedValueOnce({ case: record });
    renderPage(BookingSupportPage, `/bookings/${bookingId}/support`, "/bookings/:bookingId/support");
    await screen.findByText("No support cases yet");
    fireEvent.change(screen.getByLabelText("Case subject"), { target: { value: "Service concern" } });
    fireEvent.change(screen.getByLabelText("Describe the concern"), { target: { value: "The agreed service was not delivered." } });
    fireEvent.click(screen.getByRole("button", { name: "Open support case" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Response lost");
    expect(screen.getByLabelText("Case subject")).toBeDisabled();
    const first = createSupportCase.mock.calls[0];
    fireEvent.click(screen.getByRole("button", { name: "Open support case" }));
    await waitFor(() => expect(createSupportCase).toHaveBeenCalledTimes(2));
    expect(createSupportCase.mock.calls[1]).toEqual(first);
    expect(await screen.findByRole("link", { name: "View case" })).toHaveAttribute("href", `/support/cases/${caseId}`);
  });
  it("allows unverified users to read cases but not open another", async () => {
    auth.user.emailVerified = false; getBookingSupportCases.mockResolvedValue([record]);
    renderPage(BookingSupportPage, `/bookings/${bookingId}/support`, "/bookings/:bookingId/support");
    await screen.findByRole("link", { name: "View case" });
    expect(screen.queryByRole("button", { name: "Open support case" })).not.toBeInTheDocument();
    expect(createSupportCase).not.toHaveBeenCalled();
  });
  it("shows authorized errors without exposing a previously visible case", async () => {
    getSupportCase.mockRejectedValue({ response: { status: 403, data: { message: "Case is not accessible." } } });
    renderPage(SupportCasePage);
    expect(await screen.findByRole("alert")).toHaveTextContent("not accessible");
    expect(screen.queryByText(record.description)).not.toBeInTheDocument();
  });
  it("keeps private administrator notes out of participant timelines and renders public text safely", async () => {
    getSupportEvents.mockResolvedValue({ events: [opened, { ...opened, _id: "private", sequence: 2, kind: "private_note", visibility: "admin", body: "PRIVATE_ADMIN_CONTENT" }, { ...opened, _id: "public", sequence: 3, kind: "comment", body: '<img src=x onerror="alert(1)">' }], pagination: {} });
    const { container } = renderPage(SupportCasePage);
    await screen.findByText(record.subject);
    expect(screen.queryByText("PRIVATE_ADMIN_CONTENT")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Private administrator note")).not.toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(container.querySelector("img[onerror]")).toBeNull();
  });
  it("sends the inspected case revision on a public update and retains text on conflict", async () => {
    addSupportUpdate.mockRejectedValue({ response: { status: 409, data: { message: "Case changed. Refresh it." } } });
    renderPage(SupportCasePage); await screen.findByText(record.subject);
    fireEvent.change(screen.getByLabelText("Public case update"), { target: { value: "Additional detail" } });
    fireEvent.click(screen.getByRole("button", { name: "Post public update" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Case changed");
    expect(addSupportUpdate).toHaveBeenCalledWith(caseId, { revision: 1, body: "Additional detail" });
    expect(screen.getByLabelText("Public case update")).toHaveValue("Additional detail");
  });
  it("paginates only the public case timeline and keeps chronological history", async () => {
    getSupportEvents.mockResolvedValueOnce({ events: [{ ...opened, _id: "ten", sequence: 10, body: "Latest public update" }], pagination: { hasMore: true, nextBefore: 10 } })
      .mockResolvedValueOnce({ events: [opened], pagination: { hasMore: false } });
    renderPage(SupportCasePage); fireEvent.click(await screen.findByRole("button", { name: "Load earlier updates" }));
    await screen.findByText(opened.body);
    expect(getSupportEvents).toHaveBeenLastCalledWith(caseId, { before: 10, limit: 50 });
    expect(screen.queryByRole("button", { name: "Load earlier updates" })).not.toBeInTheDocument();
  });
  it("requires an administrator reopening reason and keeps the mutation separate from booking state", async () => {
    auth.user.role = "admin";
    getSupportCase.mockResolvedValue({ case: { ...record, status: "closed", revision: 5 }, booking });
    manageSupportCase.mockResolvedValue({ case: { ...record, status: "investigating", revision: 6 }, event: { ...opened, kind: "reopened", sequence: 6 } });
    renderPage(SupportCasePage); await screen.findByText(record.subject);
    fireEvent.change(screen.getByLabelText("Next case status"), { target: { value: "investigating" } });
    expect(screen.getByRole("button", { name: "Record case status" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reopening reason (required)"), { target: { value: "New evidence received" } });
    fireEvent.click(screen.getByRole("button", { name: "Record case status" }));
    await waitFor(() => expect(manageSupportCase).toHaveBeenCalledWith(caseId, { revision: 5, status: "investigating", reason: "New evidence received" }));
  });
  it("requires a public resolution decision before resolving a case", async () => {
    auth.user.role = "admin";
    manageSupportCase.mockResolvedValue({ case: { ...record, status: "resolved", revision: 2, resolution: "Scope reviewed with both parties." }, event: { ...opened, kind: "resolved", sequence: 2 } });
    renderPage(SupportCasePage); await screen.findByText(record.subject);
    fireEvent.change(screen.getByLabelText("Next case status"), { target: { value: "resolved" } });
    expect(screen.getByRole("button", { name: "Record case status" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Resolution decision"), { target: { value: "Scope reviewed with both parties." } });
    fireEvent.click(screen.getByRole("button", { name: "Record case status" }));
    await waitFor(() => expect(manageSupportCase).toHaveBeenCalledWith(caseId, { revision: 1, status: "resolved", resolution: "Scope reviewed with both parties." }));
    expect(await screen.findByText("Recorded resolution")).toBeInTheDocument();
  });
  it("stores private administrator notes through their own endpoint", async () => {
    auth.user.role = "admin";
    addPrivateSupportNote.mockResolvedValue({ case: { ...record, revision: 2 }, event: { ...opened, _id: "private", sequence: 2, kind: "private_note", visibility: "admin", body: "Internal assessment" } });
    renderPage(SupportCasePage); await screen.findByText(record.subject);
    fireEvent.change(screen.getByLabelText("Private administrator note"), { target: { value: "Internal assessment" } });
    fireEvent.click(screen.getByRole("button", { name: "Save private note" }));
    await waitFor(() => expect(addPrivateSupportNote).toHaveBeenCalledWith(caseId, { revision: 1, body: "Internal assessment" }));
    expect(await screen.findByText("Internal assessment")).toBeInTheDocument();
    expect(addSupportUpdate).not.toHaveBeenCalled();
  });
  it("assigns cases to the current administrator using a focused revision-checked operation", async () => {
    auth.user.role = "admin";
    manageSupportCase.mockResolvedValue({ case: { ...record, revision: 2, assigned: true, assignedAdminId: auth.user._id } });
    renderPage(SupportCasePage); await screen.findByText(record.subject);
    fireEvent.click(screen.getByRole("button", { name: "Assign to me" }));
    await waitFor(() => expect(manageSupportCase).toHaveBeenCalledWith(caseId, { revision: 1, assignedAdminId: auth.user._id }));
  });
  it("disables participant additions to a closed case while retaining history", async () => {
    getSupportCase.mockResolvedValue({ case: { ...record, status: "closed" }, booking });
    renderPage(SupportCasePage); await screen.findByText(record.subject);
    expect(screen.queryByLabelText("Public case update")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Evidence images")).not.toBeInTheDocument();
    expect(screen.getByText(opened.body)).toBeInTheDocument();
  });
  it("filters the administrator's queue without sending unsupported field values", async () => {
    getAdminSupportCases.mockResolvedValue({ cases: [record], pagination: { page: 1, pages: 1 } });
    render(<MemoryRouter><AdminSupportCasesPage /></MemoryRouter>); await screen.findByText(record.subject);
    fireEvent.change(screen.getByLabelText("Case assignment"), { target: { value: "me" } });
    await waitFor(() => expect(getAdminSupportCases).toHaveBeenLastCalledWith({ status: undefined, category: undefined, assignedTo: "me", page: 1, limit: 12 }));
  });
  it("publishes a new policy with its inspected version and exact integer cutoffs", async () => {
    const policy = { key: "standard", version: 3, title: "Policy", description: "Coordination terms", consequences: "No refund promised", customerPendingCutoffHours: null, customerAcceptedCutoffHours: 0, vendorCutoffHours: 0 };
    getCancellationPolicies.mockResolvedValue({ activePolicy: policy, policies: [policy], pagination: {} });
    publishCancellationPolicy.mockResolvedValue({ policy: { ...policy, version: 4, customerAcceptedCutoffHours: 24 } });
    render(<AdminCancellationPoliciesPage />);
    await screen.findByText("Publish version 4");
    fireEvent.change(screen.getByLabelText("Customer accepted cutoff (hours)"), { target: { value: "24" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish new policy version" }));
    await waitFor(() => expect(publishCancellationPolicy).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 3, customerAcceptedCutoffHours: 24, customerPendingCutoffHours: null })));
    expect(await screen.findByRole("status")).toHaveTextContent("Existing quoted and accepted policy snapshots remain unchanged");
  });
});
