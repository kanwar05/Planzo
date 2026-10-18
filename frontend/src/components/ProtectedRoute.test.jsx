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
const renderGuard = () => render(<MemoryRouter initialEntries={["/private"]}>
    <Routes>
      <Route element={<ProtectedRoute allowedRoles={["vendor"]} />}>
        <Route path="/private" element={<p>Private vendor content</p>} />
      </Route>
      <Route path="/login" element={<p>Login page</p>} />
      <Route path="/customer/dashboard" element={<p>Customer dashboard</p>} />
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
  it("sends a customer away from vendor pages", () => {
    Object.assign(state, {
      user: {
        role: "customer"
      },
      loading: false,
      isAuthenticated: true
    });
    renderGuard();
    expect(screen.getByText("Customer dashboard")).toBeInTheDocument();
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
});
