import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ProtectedRoute from "./ProtectedRoute";
const {
  state
} = vi.hoisted(() => ({
  state: {
    user: null,
    loading: false,
    isAuthenticated: false
  }
}));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => state
}));
const renderGuard = (allowedRoles = ["vendor"], requireVerified = false) => render(<MemoryRouter initialEntries={["/private"]}>
    <Routes>
      <Route element={<ProtectedRoute allowedRoles={allowedRoles} requireVerified={requireVerified} />}>
        <Route path="/private" element={<p>Private vendor content</p>} />
      </Route>
      <Route path="/login" element={<p>Login page</p>} />
      <Route path="/customer/dashboard" element={<p>Customer dashboard</p>} />
      <Route path="/vendor/dashboard" element={<p>Vendor dashboard</p>} />
      <Route path="/admin" element={<p>Admin dashboard</p>} />
      <Route path="/verify-account-email" element={<p>Verify email ownership</p>} />
    </Routes>
  </MemoryRouter>);
describe("role-based route access", () => {
  it("sends an unauthenticated visitor to login", () => {
    Object.assign(state, {
      user: null,
      loading: false,
      isAuthenticated: false
    });
    renderGuard();
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });
  it.each([
    ["customer", ["vendor"], "Customer dashboard"],
    ["admin", ["vendor"], "Admin dashboard"],
    ["vendor", ["admin"], "Vendor dashboard"],
  ])("sends an unauthorized %s to their own dashboard", (role, allowedRoles, destination) => {
    Object.assign(state, {
      user: {
        role
      },
      loading: false,
      isAuthenticated: true
    });
    renderGuard(allowedRoles);
    expect(screen.getByText(destination)).toBeInTheDocument();
  });
  it("renders the authorized vendor page", () => {
    Object.assign(state, {
      user: {
        role: "vendor"
      },
      loading: false,
      isAuthenticated: true
    });
    renderGuard();
    expect(screen.getByText("Private vendor content")).toBeInTheDocument();
  });
  it.each([undefined, false])("requires proof for marketplace routes when emailVerified is %s", emailVerified => {
    Object.assign(state, { user: { role: "vendor", emailVerified }, loading: false, isAuthenticated: true });
    renderGuard(["vendor"], true);
    expect(screen.getByText("Verify email ownership")).toBeInTheDocument();
    expect(screen.queryByText("Private vendor content")).not.toBeInTheDocument();
  });
  it("keeps verified marketplace access and administrator compatibility", () => {
    Object.assign(state, { user: { role: "admin", emailVerified: false }, loading: false, isAuthenticated: true });
    renderGuard(["admin"], true);
    expect(screen.getByText("Private vendor content")).toBeInTheDocument();
  });
});
