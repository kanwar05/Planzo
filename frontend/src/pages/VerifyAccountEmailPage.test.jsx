import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VerifyAccountEmailPage from "./VerifyAccountEmailPage";
import { requestEmailVerification, verifyInitialEmail } from "../services/authService";
const { updateUser, state } = vi.hoisted(() => ({ updateUser: vi.fn(), state: { user: null } }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ ...state, updateUser }) }));
vi.mock("../services/authService", () => ({ requestEmailVerification: vi.fn(), verifyInitialEmail: vi.fn() }));
const renderPage = (pathname = "/booking/vendor-1") => render(<MemoryRouter initialEntries={[{ pathname: "/verify-account-email", state: { from: { pathname } } }]}><Routes>
  <Route path="/verify-account-email" element={<VerifyAccountEmailPage />} />
  <Route path="/booking/vendor-1" element={<p>Selected vendor booking</p>} />
  <Route path="/customer/dashboard" element={<p>Customer account</p>} />
</Routes></MemoryRouter>);
describe("initial email verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.user = { role: "customer", email: "customer@example.test", emailVerified: false };
    requestEmailVerification.mockResolvedValue({ message: "Code sent." });
    verifyInitialEmail.mockResolvedValue({ ...state.user, emailVerified: true });
  });
  it("requests a code for the authenticated address, verifies it and returns to the selected vendor", async () => {
    renderPage();
    expect(screen.getByText(/customer@example.test/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send verification code" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Code sent.");
    expect(requestEmailVerification).toHaveBeenCalledWith();
    fireEvent.change(screen.getByLabelText("Six-digit verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify email and continue" }));
    expect(await screen.findByText("Selected vendor booking")).toBeInTheDocument();
    expect(verifyInitialEmail).toHaveBeenCalledWith("123456");
    expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ emailVerified: true }));
  });
  it("keeps invalid/expired codes recoverable without claiming verification", async () => {
    verifyInitialEmail.mockRejectedValue({ response: { data: { message: "Code expired." } } });
    renderPage();
    fireEvent.change(screen.getByLabelText("Six-digit verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify email and continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Code expired.");
    expect(updateUser).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Verify email and continue" })).toBeEnabled();
  });
  it("shows resend limits and blocks duplicate sends while pending", async () => {
    let reject;
    requestEmailVerification.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Send verification code" }));
    fireEvent.click(screen.getByRole("button", { name: "Send verification code" }));
    expect(requestEmailVerification).toHaveBeenCalledTimes(1);
    reject({ response: { data: { message: "Wait before requesting another code." } } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Wait before requesting another code.");
  });
  it("rejects an external return location for already verified users", async () => {
    state.user.emailVerified = true;
    renderPage("//evil.example");
    expect(await screen.findByText("Customer account")).toBeInTheDocument();
    await waitFor(() => expect(verifyInitialEmail).not.toHaveBeenCalled());
  });
});
