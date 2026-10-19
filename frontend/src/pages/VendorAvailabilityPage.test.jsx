import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VendorAvailabilityPage from "./VendorAvailabilityPage";
import { getMyAvailability, updateAvailability } from "../services/availabilityService";

vi.mock("../services/availabilityService", () => ({ getMyAvailability: vi.fn(), updateAvailability: vi.fn() }));

const availability = { availableDates: ["2030-03-01", "2030-03-02"], unavailableDates: [], bookedDates: ["2030-02-01"] };

describe("vendor date availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMyAvailability.mockResolvedValue({ availability });
    updateAvailability.mockResolvedValue({ ...availability, unavailableDates: ["2030-03-01"], availableDates: ["2030-03-02"] });
  });

  it("protects dates reserved by accepted bookings", async () => {
    render(<MemoryRouter><VendorAvailabilityPage /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("Date"), { target: { value: "2030-02-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Block date" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This date already has an accepted booking.");
    expect(updateAvailability).not.toHaveBeenCalled();
  });

  it("blocks a date while preserving other explicitly available dates", async () => {
    render(<MemoryRouter><VendorAvailabilityPage /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("Date"), { target: { value: "2030-03-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Block date" }));
    await waitFor(() => expect(updateAvailability).toHaveBeenCalledWith({ unavailableDates: ["2030-03-01"], availableDates: ["2030-03-02"] }));
    expect(await screen.findByRole("button", { name: /Make .* available/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveValue("");
  });
});
