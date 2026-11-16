import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUnreadMessages } from "./useUnreadMessages";
import { getUnreadCounts } from "../services/messagingService";
vi.mock("../services/messagingService", () => ({ getUnreadCounts: vi.fn() }));
const id = "b".repeat(24);
describe("dashboard unread counts", () => {
  beforeEach(() => vi.resetAllMocks());
  it("loads only valid booking identifiers and reports unread counts", async () => {
    getUnreadCounts.mockResolvedValue({ unreadCounts: { [id]: 3 } });
    const { result } = renderHook(() => useUnreadMessages([{ _id: id }, { _id: "invalid" }], { _id: "customer" }));
    await waitFor(() => expect(result.current.total).toBe(3));
    expect(getUnreadCounts).toHaveBeenCalledWith([id]);
  });
  it("does not expose a previous user's response after account change", async () => {
    let finish;
    getUnreadCounts.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ unreadCounts: { [id]: 1 } });
    const { result, rerender } = renderHook(({ user }) => useUnreadMessages([{ _id: id }], user), { initialProps: { user: { _id: "first" } } });
    rerender({ user: { _id: "second" } });
    await waitFor(() => expect(result.current.total).toBe(1));
    await act(async () => { finish({ unreadCounts: { [id]: 99 } }); });
    await waitFor(() => expect(result.current.total).toBe(1));
  });
});
