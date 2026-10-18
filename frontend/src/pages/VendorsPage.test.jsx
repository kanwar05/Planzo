import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VendorsPage from "./VendorsPage";
import { getVendors } from "../services/vendorService";
vi.mock("../services/vendorService", () => ({
  getVendors: vi.fn()
}));
describe("vendor search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVendors.mockResolvedValue({
      vendors: [],
      pagination: {
        total: 0,
        page: 1,
        pages: 1
      }
    });
  });
  it("respects category links and submits only the MVP search filters", async () => {
    render(<MemoryRouter initialEntries={["/vendors?category=Catering"]}>
    <VendorsPage />
  </MemoryRouter>);
    await waitFor(() => expect(getVendors).toHaveBeenCalled());
    expect(screen.getByLabelText("Category")).toHaveValue("Catering");
    fireEvent.change(screen.getByLabelText("Vendor or service"), {
      target: {
        value: "Studio"
      }
    });
    fireEvent.change(screen.getByLabelText("City"), {
      target: {
        value: "Delhi"
      }
    });
    fireEvent.change(screen.getByLabelText("Minimum price (INR)"), {
      target: {
        value: "5000"
      }
    });
    fireEvent.change(screen.getByLabelText("Maximum price (INR)"), {
      target: {
        value: "20000"
      }
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Search"
    }));
    await waitFor(() => expect(getVendors).toHaveBeenLastCalledWith({
      search: "Studio",
      category: "Catering",
      city: "Delhi",
      minPrice: "5000",
      maxPrice: "20000",
      page: 1,
      limit: 12
    }, expect.objectContaining({
      signal: expect.any(AbortSignal)
    })));
  });
  it("clears a validation error when a corrected search keeps the same URL", async () => {
    render(<MemoryRouter initialEntries={["/vendors?minPrice=5000&maxPrice=20000"]}>
    <VendorsPage />
  </MemoryRouter>);
    await screen.findByRole("button", {
      name: "Clear filters"
    });
    fireEvent.change(screen.getByLabelText("Minimum price (INR)"), {
      target: {
        value: "30000"
      }
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Search"
    }));
    expect(screen.getByRole("alert")).toHaveTextContent("Minimum price must not exceed maximum price.");
    fireEvent.change(screen.getByLabelText("Minimum price (INR)"), {
      target: {
        value: "5000"
      }
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Search"
    }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(getVendors).toHaveBeenCalledTimes(2);
  });
});
