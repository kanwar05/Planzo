import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import VendorCard from "./VendorCard";

const vendor = {
  _id: "vendor-1",
  businessName: "Celebration Studio",
  serviceCategory: "Decoration",
  location: "Delhi",
  pricing: 50000,
  averageRating: 4.8,
  reviewCount: 12,
};

describe("VendorCard favorites", () => {
  it("fires save vendor flow from the outlined heart", async () => {
    const user = userEvent.setup();
    const onToggleFavorite = vi.fn();

    render(
      <MemoryRouter>
        <VendorCard vendor={vendor} onToggleFavorite={onToggleFavorite} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /save vendor/i }));

    expect(onToggleFavorite).toHaveBeenCalledOnce();
  });

  it("fires remove vendor flow from the filled heart", async () => {
    const user = userEvent.setup();
    const onToggleFavorite = vi.fn();

    render(
      <MemoryRouter>
        <VendorCard
          vendor={vendor}
          isFavorited
          onToggleFavorite={onToggleFavorite}
        />
      </MemoryRouter>,
    );

    await user.click(
      screen.getByRole("button", { name: /remove from favorites/i }),
    );

    expect(onToggleFavorite).toHaveBeenCalledOnce();
  });
});
