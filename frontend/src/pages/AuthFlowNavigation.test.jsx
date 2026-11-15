import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtectedRoute from "../components/ProtectedRoute";
import LoginPage from "./LoginPage";
import RegisterPage from "./RegisterPage";
import VerifyAccountEmailPage from "./VerifyAccountEmailPage";
const { account, register, verifyInitialEmail } = vi.hoisted(() => ({ account: { user: null }, register: vi.fn(), verifyInitialEmail: vi.fn() }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: account.user, isAuthenticated: Boolean(account.user), loading: false, register, login: vi.fn(), requestLoginOtp: vi.fn(), verifyLoginOtp: vi.fn(), updateUser: user => { account.user = user; } }) }));
vi.mock("../services/authService", () => ({ requestEmailVerification: vi.fn(), verifyInitialEmail }));
function Destination() {
  const location = useLocation();
  return <p>Destination: {location.pathname}; business: {location.state?.businessName}; package: {location.state?.packageId}</p>;
}
function renderFlow(initialEntries) {
  return render(<MemoryRouter initialEntries={initialEntries}><Routes>
    <Route element={<ProtectedRoute allowedRoles={["customer"]} requireVerified />}><Route path="/booking/:vendorId" element={<Destination />} /></Route>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/verify-account-email" element={<VerifyAccountEmailPage />} />
    <Route path="/customer/dashboard" element={<Destination />} />
    <Route path="/vendor/profile-setup" element={<Destination />} />
  </Routes></MemoryRouter>);
}
function fillRegistration(role = "customer") {
  if (role === "vendor") {
    fireEvent.click(screen.getByRole("button", { name: "vendor registration" }));
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Celebration Studio" } });
    fireEvent.change(screen.getByLabelText("Service category"), { target: { value: "Decoration" } });
  }
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Planzo User" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "user@example.test" } });
  fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "9999999991" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password1!" } });
  fireEvent.click(screen.getByRole("button", { name: `Create ${role} account` }));
}
async function verifyEmail() {
  fireEvent.change(await screen.findByLabelText("Six-digit verification code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify email and continue" }));
}
describe("booking intent through registration and verification", () => {
  beforeEach(() => {
    vi.clearAllMocks(); account.user = null;
    register.mockImplementation(async payload => {
      account.user = { role: payload.role, email: payload.email, emailVerified: false };
      return account.user;
    });
    verifyInitialEmail.mockImplementation(async () => ({ ...account.user, emailVerified: true }));
  });
  it("returns a new customer to the selected booking after guest login, registration and verification", async () => {
    renderFlow(["/booking/vendor-1"]);
    fireEvent.click(await screen.findByRole("link", { name: "Create an account" }));
    fillRegistration();
    await verifyEmail();
    expect(await screen.findByText(/Destination: \/booking\/vendor-1/)).toBeInTheDocument();
    expect(account.user.emailVerified).toBe(true);
  });
  it("preserves vendor onboarding details through verification", async () => {
    renderFlow(["/register"]);
    fillRegistration("vendor");
    await verifyEmail();
    expect(await screen.findByText(/Destination: \/vendor\/profile-setup; business: Celebration Studio/)).toBeInTheDocument();
  });
  it("preserves a validated package id through guest registration and verification", async () => {
    const packageId = "1234567890abcdef12345678";
    renderFlow([{ pathname: "/booking/vendor-1", state: { packageId } }]);
    fireEvent.click(await screen.findByRole("link", { name: "Create an account" }));
    fillRegistration();
    await verifyEmail();
    expect(await screen.findByText(new RegExp(`Destination: /booking/vendor-1;.*package: ${packageId}`))).toBeInTheDocument();
  });
  it("uses an internal fallback when registration receives an unsafe saved destination", async () => {
    renderFlow([{ pathname: "/register", state: { from: { pathname: "//evil.example" } } }]);
    fillRegistration();
    await verifyEmail();
    expect(await screen.findByText(/Destination: \/customer\/dashboard/)).toBeInTheDocument();
  });
});
