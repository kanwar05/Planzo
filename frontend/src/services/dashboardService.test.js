import { describe, expect, it, vi } from "vitest";
import {
  getAdminDashboard,
  getCustomerDashboard,
  getVendorDashboard,
  exportVendorAnalytics,
} from "./dashboardService";
import { api } from "./api";

vi.mock("./api", () => ({
  api: {
    get: vi.fn(),
  },
}));

describe("dashboardService", () => {
  it("loads the customer analytics dashboard with query params", async () => {
    api.get.mockResolvedValueOnce({
      data: { dashboard: { summary: { totalBookings: 3 } } },
    });

    const dashboard = await getCustomerDashboard({ limit: 5 });

    expect(api.get).toHaveBeenCalledWith("/analytics/customer", {
      params: { limit: 5 },
    });
    expect(dashboard.summary.totalBookings).toBe(3);
  });

  it("loads vendor and admin analytics dashboards", async () => {
    api.get
      .mockResolvedValueOnce({ data: { dashboard: { summary: { totalBookings: 4 } } } })
      .mockResolvedValueOnce({ data: { dashboard: { summary: { totalUsers: 7 } } } });

    await expect(getVendorDashboard()).resolves.toEqual({
      summary: { totalBookings: 4 },
    });
    await expect(getAdminDashboard()).resolves.toEqual({
      summary: { totalUsers: 7 },
    });
  });

  it("downloads the filtered vendor analytics CSV", async () => {
    const blob = new Blob(["metric,value"]);
    api.get.mockResolvedValueOnce({ data: blob });
    await expect(exportVendorAnalytics({ startDate: "2026-01-01" })).resolves.toBe(blob);
    expect(api.get).toHaveBeenCalledWith("/analytics/vendor/export", {
      params: { startDate: "2026-01-01" },
      responseType: "blob",
    });
  });
});
