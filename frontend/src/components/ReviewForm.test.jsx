import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ReviewForm from "./ReviewForm";

describe("ReviewForm", () => {
  it("requires a rating before submitting", async () => {
    const user = userEvent.setup();
    render(
      <ReviewForm
        vendorName="Celebration Studio"
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.type(
      screen.getByPlaceholderText(/what went well/i),
      "Wonderful service",
    );
    await user.click(screen.getByRole("button", { name: /publish review/i }));

    expect(screen.getByText("Choose a star rating.")).toBeInTheDocument();
  });

  it("submits rating and comment for a completed-booking review", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ReviewForm
        vendorName="Celebration Studio"
        submitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Rate 5 out of 5" }));
    await user.type(
      screen.getByPlaceholderText(/what went well/i),
      "Beautiful work and excellent communication.",
    );
    await user.click(screen.getByRole("button", { name: /publish review/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        rating: 5,
        comment: "Beautiful work and excellent communication.",
      }),
    );
  });
});
