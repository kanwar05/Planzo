import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomerFavoritesPage from "./CustomerFavoritesPage";
import * as favoriteService from "../services/favoriteService";

vi.mock("../services/favoriteService");

const favorite = {
  _id: "favorite-1",
  vendorId: {
    _id: "vendor-1",
    businessName: "Celebration Studio",
    serviceCategory: "Decoration",
    location: "Delhi",
    pricing: 50000,
    averageRating: 4.8,
    reviewCount: 12,
  },
};

describe("CustomerFavoritesPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders saved vendors and removes one optimistically", async () => {
    const user = userEvent.setup();
    favoriteService.getFavorites.mockResolvedValue([favorite]);
    favoriteService.removeFavorite.mockResolvedValue({ isFavorited: false });

    render(
      <MemoryRouter>
        <CustomerFavoritesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Celebration Studio")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /remove/i }));

    expect(favoriteService.removeFavorite).toHaveBeenCalledWith("vendor-1");
    await waitFor(() =>
      expect(screen.queryByText("Celebration Studio")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText("Vendor removed from favorites"),
    ).toBeInTheDocument();
  });

  it("renders an empty state when there are no saved vendors", async () => {
    favoriteService.getFavorites.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <CustomerFavoritesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("No saved vendors yet")).toBeInTheDocument();
  });
});
