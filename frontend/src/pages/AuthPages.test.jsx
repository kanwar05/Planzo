import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./LoginPage";
import RegisterPage from "./RegisterPage";
const { login, register, requestLoginOtp, verifyLoginOtp } = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn(), requestLoginOtp: vi.fn(), verifyLoginOtp: vi.fn() }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ login, register, requestLoginOtp, verifyLoginOtp }) }));
describe("account entry", () => {
  beforeEach(() => vi.clearAllMocks());
  it("requests and verifies an email sign-in code", async () => {
    requestLoginOtp.mockResolvedValue({ message: "sent" });
    verifyLoginOtp.mockResolvedValue({ role: "customer" });
    render(<MemoryRouter initialEntries={["/login"]}><Routes><Route path="/login" element={<LoginPage />} /><Route path="/customer/dashboard" element={<p>Customer dashboard reached</p>} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Email code" }));
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "customer@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
    await waitFor(() => expect(requestLoginOtp).toHaveBeenCalledWith("customer@example.test"));
    fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Customer dashboard reached")).toBeInTheDocument();
    expect(verifyLoginOtp).toHaveBeenCalledWith({ email: "customer@example.test", code: "123456" });
  });
  it("sends an admin to the admin dashboard after login", async () => {
    login.mockResolvedValue({ role: "admin" });
    render(<MemoryRouter initialEntries={["/login"]}><Routes><Route path="/login" element={<LoginPage />} /><Route path="/admin" element={<p>Admin overview reached</p>} /></Routes></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "admin@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password1!" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Admin overview reached")).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith({ email: "admin@example.test", password: "Password1!" });
  });
  it.each(["customer", "vendor"])("registers a %s with the selected role", async (role) => {
    register.mockResolvedValue({ role });
    const destination = role === "vendor" ? "/vendor/profile-setup" : "/customer/dashboard";
    render(<MemoryRouter initialEntries={["/register"]}><Routes><Route path="/register" element={<RegisterPage />} /><Route path={destination} element={<p>Account destination reached</p>} /></Routes></MemoryRouter>);
    if (role === "vendor") fireEvent.click(screen.getByRole("button", { name: "vendor registration" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Planzo User" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "user@example.test" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "9999999991" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password1!" } });
    if (role === "vendor") {
      fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Event Studio" } });
      fireEvent.change(screen.getByLabelText("Service category"), { target: { value: "Decoration" } });
    }
    fireEvent.click(screen.getByRole("button", { name: `Create ${role} account` }));
    await waitFor(() => expect(register).toHaveBeenCalledWith({ name: "Planzo User", email: "user@example.test", phone: "9999999991", password: "Password1!", role }));
    expect(await screen.findByText("Account destination reached")).toBeInTheDocument();
  });
  it.each([["vendor", "vendor"], ["admin", "customer"], ["VENDOR", "customer"]])("opens role=%s with the safe %s registration form", (requestedRole, selectedRole) => {
    render(<MemoryRouter initialEntries={[`/register?role=${requestedRole}`]}><RegisterPage /></MemoryRouter>);
    expect(screen.getByRole("button", { name: `${selectedRole} registration` })).toHaveAttribute("aria-pressed", "true");
    if (selectedRole === "vendor") expect(screen.getByLabelText("Business name")).toBeInTheDocument();
    else expect(screen.queryByLabelText("Business name")).not.toBeInTheDocument();
  });
});
