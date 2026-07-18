import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ChatMessageList, {
  getMessageSenderId,
  isOwnChatMessage,
} from "./ChatMessageList";

const currentUserId = "64b000000000000000000001";
const otherUserId = "64b000000000000000000002";
const message = (id, sender, text) => ({
  _id: id,
  sender,
  text,
  attachments: [],
  deliveredTo: [],
  seenBy: [],
  createdAt: `2026-07-18T10:0${id}:00.000Z`,
});

describe("ChatMessageList alignment", () => {
  it("right-aligns a current-user message with a populated sender object", () => {
    const own = message("1", { _id: currentUserId, name: "Current User" }, "mine");
    render(<ChatMessageList messages={[own]} currentUserId={currentUserId} otherUserId={otherUserId} />);

    expect(getMessageSenderId(own)).toBe(currentUserId);
    expect(isOwnChatMessage(own, currentUserId)).toBe(true);
    expect(screen.getByTestId("message-row-1")).toHaveClass("w-full", "justify-end");
    expect(screen.getByText("mine").parentElement).toHaveClass("bg-emerald-600");
  });

  it("left-aligns another user's message with a populated sender object", () => {
    render(<ChatMessageList messages={[message("2", { _id: otherUserId }, "theirs")]} currentUserId={currentUserId} otherUserId={otherUserId} />);
    expect(screen.getByTestId("message-row-2")).toHaveClass("w-full", "justify-start");
    expect(screen.getByText("theirs").parentElement).toHaveClass("bg-white");
  });

  it("handles plain MongoDB sender IDs", () => {
    const own = message("3", currentUserId, "plain own");
    const received = message("4", otherUserId, "plain received");
    render(<ChatMessageList messages={[own, received]} currentUserId={currentUserId} otherUserId={otherUserId} />);
    expect(screen.getByTestId("message-row-3")).toHaveClass("justify-end");
    expect(screen.getByTestId("message-row-4")).toHaveClass("justify-start");
  });

  it("preserves chronological order and aligns a realtime message after rerender", () => {
    const first = message("1", otherUserId, "first");
    const second = message("2", currentUserId, "second");
    const { rerender, container } = render(<ChatMessageList messages={[first, second]} currentUserId={currentUserId} otherUserId={otherUserId} />);
    const realtime = message("3", { _id: otherUserId }, "realtime third");
    rerender(<ChatMessageList messages={[first, second, realtime]} currentUserId={currentUserId} otherUserId={otherUserId} />);

    expect([...container.querySelectorAll("[data-message-id]")].map((node) => node.dataset.messageId)).toEqual(["1", "2", "3"]);
    expect(screen.getByTestId("message-row-3")).toHaveClass("justify-start");
  });
});
