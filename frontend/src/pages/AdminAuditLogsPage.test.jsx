import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAuditLogsPage from "./AdminAuditLogsPage";

const getAuditLogs = vi.fn();
const exportAuditLogsCsv = vi.fn();
vi.mock("../services/auditService", () => ({
  getAuditLogs: (...args) => getAuditLogs(...args),
  exportAuditLogsCsv: (...args) => exportAuditLogsCsv(...args),
}));

describe("AdminAuditLogsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuditLogs.mockResolvedValue({
      logs: [{
        _id: "log-1", createdAt: "2026-07-26T10:00:00.000Z",
        action: "role_changed", admin: { name: "Admin", email: "admin@planzo.test" },
        targetType: "User", targetLabel: "user@planzo.test",
        ip: "127.0.0.1", browser: "Chrome", oldValue: { role: "customer" },
        newValue: { role: "vendor" }, reason: "Vendor approved",
      }],
      pagination: { page: 1, pages: 1, total: 1 },
    });
    exportAuditLogsCsv.mockResolvedValue();
  });

  it("renders audit data and applies search/action filters", async () => {
    render(<MemoryRouter><AdminAuditLogsPage /></MemoryRouter>);
    expect(await screen.findByText("user@planzo.test")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Target, reason, IP, browser…"), { target: { value: "vendor" } });
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "role_changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(getAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({
      search: "vendor", action: "role_changed", page: 1,
    })));
  });

  it("exports the active filtered result set", async () => {
    render(<MemoryRouter><AdminAuditLogsPage /></MemoryRouter>);
    await screen.findByText("user@planzo.test");
    fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(exportAuditLogsCsv).toHaveBeenCalledWith({
      search: "", action: "", from: "", to: "",
    }));
  });
});
