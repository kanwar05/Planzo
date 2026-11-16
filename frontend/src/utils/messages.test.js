import { beforeEach, describe, expect, it } from "vitest";
import { mergeConversation, mergeMessages } from "./messages";
import { clearMessageIntent, readMessageIntent, retainMessageIntents, storeMessageIntent } from "./messageIntent";
beforeEach(() => sessionStorage.clear());
describe("message reliability helpers", () => {
  it("orders history and deduplicates overlap without moving receipts backwards", () => {
    const first = { _id: "one", sequence: 1, body: "First" }, second = { _id: "two", sequence: 2, body: "Second" };
    expect(mergeMessages([second], [first, second])).toEqual([first, second]);
    expect(mergeConversation({ lastSequence: 5, selfReadSequence: 4, peerReadSequence: 3 }, { lastSequence: 3, selfReadSequence: 2, peerReadSequence: 1 }))
      .toEqual(expect.objectContaining({ lastSequence: 5, selfReadSequence: 4, peerReadSequence: 3 }));
  });
  it("scopes unresolved submissions to a tab user and clears them on logout/account change", () => {
    const intent = { clientMessageId: "message-client-123456", body: "Coordinate setup" };
    storeMessageIntent("customer-a", "booking", intent); storeMessageIntent("customer-b", "booking", intent);
    expect(readMessageIntent("customer-a", "booking")).toEqual(intent);
    expect(readMessageIntent("customer-c", "booking")).toBeNull();
    retainMessageIntents("customer-b"); expect(readMessageIntent("customer-a", "booking")).toBeNull();
    clearMessageIntent("customer-b", "booking"); expect(readMessageIntent("customer-b", "booking")).toBeNull();
    storeMessageIntent("customer-b", "booking", intent); retainMessageIntents(); expect(sessionStorage.length).toBe(0);
  });
});
