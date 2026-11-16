import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { io } from "socket.io-client";
import { api } from "./api";
import { createConversationConnection } from "./conversationConnection";
vi.mock("socket.io-client", () => ({ io: vi.fn() }));
vi.mock("./api", () => ({ api: { defaults: { baseURL: "https://api.example.test/api" }, get: vi.fn() } }));
let handlers, socket;
const bookingId = "b".repeat(24);
beforeEach(() => {
  vi.resetAllMocks(); handlers = {};
  socket = { connected: false, on: vi.fn((name, callback) => { handlers[name] = callback; }), emit: vi.fn(),
    connect: vi.fn(), disconnect: vi.fn(), removeAllListeners: vi.fn(), volatile: { emit: vi.fn() } };
  io.mockReturnValue(socket); api.get.mockResolvedValue({ data: {} });
});
afterEach(() => vi.useRealTimers());

describe("conversation socket transport", () => {
  it("uses HttpOnly-cookie credentials and resynchronizes only after authorized join", () => {
    const onResync = vi.fn(), onState = vi.fn();
    const connection = createConversationConnection({ bookingId, onResync, onState });
    expect(io).toHaveBeenCalledWith("https://api.example.test", expect.objectContaining({ withCredentials: true, autoConnect: false, path: "/socket.io" }));
    expect(socket.connect).toHaveBeenCalledOnce();
    socket.connected = true; handlers.connect();
    expect(socket.emit).toHaveBeenCalledWith("conversation:join", { bookingId }, expect.any(Function));
    expect(onResync).not.toHaveBeenCalled();
    socket.emit.mock.calls[0][2]({ success: true });
    expect(onState).toHaveBeenLastCalledWith("connected"); expect(onResync).toHaveBeenCalledOnce();
    connection.close();
  });
  it("filters cross-booking events and never buffers offline typing", () => {
    const onMessage = vi.fn();
    const connection = createConversationConnection({ bookingId, onMessage });
    handlers["message:new"]({ bookingId: "other", message: { body: "Private" } });
    expect(onMessage).not.toHaveBeenCalled();
    handlers["message:new"]({ bookingId, message: { body: "Authorized" } });
    expect(onMessage).toHaveBeenCalledOnce();
    connection.typing(true); expect(socket.volatile.emit).not.toHaveBeenCalled();
    socket.connected = true; connection.typing(true);
    expect(socket.volatile.emit).toHaveBeenCalledWith("conversation:typing", { bookingId, isTyping: true });
    connection.close();
  });
  it("refreshes through the existing REST session interceptor on expired access", async () => {
    const connection = createConversationConnection({ bookingId });
    await handlers.connect_error({ data: { status: 401 } });
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledWith("/auth/me"));
    await vi.waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(2));
    expect(io.mock.calls[0][1].auth).toBeUndefined();
    connection.close();
  });
  it("stops unauthorized reconnects and removes listeners/timers on leave", async () => {
    vi.useFakeTimers();
    const onState = vi.fn(), onMessage = vi.fn();
    const connection = createConversationConnection({ bookingId, onState, onMessage });
    handlers.connect_error({ data: { status: 403 } });
    expect(onState).toHaveBeenLastCalledWith("unavailable");
    expect(api.get).not.toHaveBeenCalled();
    handlers.disconnect("io server disconnect"); connection.close();
    await vi.runAllTimersAsync();
    expect(api.get).not.toHaveBeenCalled(); expect(socket.removeAllListeners).toHaveBeenCalled();
    handlers["message:new"]({ bookingId }); expect(onMessage).not.toHaveBeenCalled();
  });
});
