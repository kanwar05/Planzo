import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookingConversationPage from "./BookingConversationPage";
import { createConversationConnection } from "../services/conversationConnection";
import { getConversation, getMessages, markConversationRead, sendMessage } from "../services/messagingService";

const account = vi.hoisted(() => ({ user: { _id: "a".repeat(24), role: "customer", emailVerified: true } }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => account }));
vi.mock("../services/conversationConnection", () => ({ createConversationConnection: vi.fn() }));
vi.mock("../services/messagingService", () => ({ getConversation: vi.fn(), getMessages: vi.fn(), markConversationRead: vi.fn(), sendMessage: vi.fn() }));
vi.mock("../services/quotationService", () => ({ getQuotations: vi.fn().mockResolvedValue([]) }));
const bookingId = "b".repeat(24);
const booking = { _id: bookingId, status: "pending", eventType: "Wedding", eventDate: "2099-04-01T00:00:00.000Z", eventLocation: "Garden Venue", description: "A floral celebration", quotationRevision: 0 };
const conversation = { _id: "c".repeat(24), bookingId, lastSequence: 1, selfRole: "customer", peer: { name: "Event Studio", role: "vendor" }, selfReadSequence: 0, peerReadSequence: 0, canSend: true, unreadCount: 1 };
const incoming = { _id: "message-1", bookingId, sequence: 1, senderRole: "vendor", body: "Welcome to your booking", createdAt: "2026-11-16T03:00:00.000Z", clientMessageId: "vendor-message-0001" };
const page = (messages = [incoming], metadata = conversation, pagination = { hasMore: false }) => ({ messages, conversation: metadata, pagination });
const renderPage = () => render(<MemoryRouter initialEntries={[`/bookings/${bookingId}/messages`]}><Routes><Route path="/bookings/:bookingId/messages" element={<BookingConversationPage />} /></Routes></MemoryRouter>);
const loaded = () => screen.findByRole("heading", { name: "Messages with Event Studio" });
let focus;

describe("booking conversation", () => {
  beforeEach(() => {
    vi.resetAllMocks(); sessionStorage.clear();
    account.user = { _id: "a".repeat(24), role: "customer", emailVerified: true };
    focus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    getConversation.mockResolvedValue({ booking, conversation });
    getMessages.mockImplementation(async (_id, params) => params.after !== undefined ? page([], conversation) : page());
    markConversationRead.mockImplementation(async (_id, through) => ({ conversation: { ...conversation, selfReadSequence: through, unreadCount: 0 } }));
    createConversationConnection.mockReturnValue({ close: vi.fn(), typing: vi.fn() });
  });
  afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });

  it("renders participant history as text and shows the booking summary without exposing account contacts", async () => {
    const body = '<img src=x onerror="alert(1)">';
    getMessages.mockResolvedValue(page([{ ...incoming, body }]));
    renderPage(); await loaded();
    const history = screen.getByRole("log", { name: "Conversation history" });
    expect(within(history).getByText(body)).toBeInTheDocument();
    expect(history.querySelector("img")).toBeNull();
    expect(within(history).getByText(/16 Nov 2026.*UTC/)).toBeInTheDocument();
    expect(screen.getByText("Booking and quotation details")).toBeInTheDocument();
    expect(screen.getByText("Garden Venue")).toBeInTheDocument();
  });

  it("submits one durable send during double submission and updates read receipts monotonically", async () => {
    let finish;
    sendMessage.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    renderPage(); await loaded();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "  Please include seasonal flowers  " } });
    const send = screen.getByRole("button", { name: "Send message" });
    fireEvent.click(send); fireEvent.click(send);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const payload = sendMessage.mock.calls[0][1];
    expect(payload).toEqual({ body: "Please include seasonal flowers", clientMessageId: expect.any(String) });
    expect(screen.getByLabelText("Message")).toBeDisabled();
    const own = { ...incoming, _id: "message-2", sequence: 2, senderRole: "customer", ...payload };
    await act(async () => { finish({ message: own, conversation: { ...conversation, lastSequence: 2 } }); });
    expect(await screen.findByText("Please include seasonal flowers")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Your message 2" })).getByText("Sent")).toBeInTheDocument();
    await act(async () => { createConversationConnection.mock.calls[0][0].onRead({ bookingId, readerRole: "vendor", readThroughSequence: 2 }); });
    await act(async () => { createConversationConnection.mock.calls[0][0].onRead({ bookingId, readerRole: "vendor", readThroughSequence: 1 }); });
    expect(within(screen.getByRole("article", { name: "Your message 2" })).getByText("Read")).toBeInTheDocument();
  });

  it("retains an ambiguous attempt across refresh and retries the same identity even after closure", async () => {
    sendMessage.mockRejectedValueOnce(new Error("Response lost"));
    const first = renderPage(); await loaded();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Please confirm the setup time" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByRole("button", { name: "Retry message" });
    const original = sendMessage.mock.calls[0];
    first.unmount();
    getConversation.mockResolvedValue({ booking: { ...booking, status: "cancelled" }, conversation: { ...conversation, canSend: false } });
    const own = { ...incoming, _id: "message-2", sequence: 2, senderRole: "customer", ...original[1] };
    sendMessage.mockResolvedValue({ message: own, conversation: { ...conversation, lastSequence: 2, canSend: false } });
    renderPage(); await loaded();
    expect(screen.getByLabelText("Message")).toHaveValue(original[1].body);
    expect(screen.getByLabelText("Message")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry message" }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    expect(sendMessage.mock.calls[1]).toEqual(original);
    expect(await screen.findByText(original[1].body)).toBeInTheDocument();
    expect(screen.queryByLabelText("Message")).not.toBeInTheDocument();
    expect(sessionStorage.length).toBe(0);
  });

  it.each(["completed", "rejected", "cancelled"])("keeps %s history readable without a new-message composer", async status => {
    getConversation.mockResolvedValue({ booking: { ...booking, status }, conversation: { ...conversation, canSend: false } });
    getMessages.mockResolvedValue(page([incoming], { ...conversation, canSend: false }));
    renderPage(); await loaded();
    expect(screen.getByText(incoming.body)).toBeInTheDocument();
    expect(screen.queryByLabelText("Message")).not.toBeInTheDocument();
    expect(screen.getByText(/This booking is closed/)).toBeInTheDocument();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("allows an unverified participant to read without sending", async () => {
    account.user = { ...account.user, emailVerified: false };
    renderPage(); await loaded();
    expect(screen.getByText(incoming.body)).toBeInTheDocument();
    expect(screen.getByText(/Verify your email to send/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Message")).not.toBeInTheDocument();
  });

  it("loads older pages with a stable cursor and deduplicates overlapping history", async () => {
    getMessages.mockImplementation(async (_id, params) => params.before
      ? page([{ ...incoming, _id: "earlier", sequence: 1, body: "Earlier question" }, { ...incoming, sequence: 50 }])
      : page([{ ...incoming, sequence: 50 }, { ...incoming, _id: "latest", sequence: 51, body: "Latest reply" }], { ...conversation, lastSequence: 51 }, { hasMore: true, nextBefore: 50 }));
    renderPage(); await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Load earlier messages" }));
    expect(await screen.findByText("Earlier question")).toBeInTheDocument();
    expect(getMessages).toHaveBeenCalledWith(bookingId, { before: 50, limit: 50 }, expect.any(Object));
    expect(within(screen.getByRole("log")).getAllByRole("article")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Load earlier messages" })).not.toBeInTheDocument();
  });

  it("waits until the visible latest messages are reached before acknowledging them", async () => {
    focus.mockReturnValue(false);
    renderPage(); await loaded();
    expect(markConversationRead).not.toHaveBeenCalled();
    const history = screen.getByRole("log");
    Object.defineProperties(history, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 300 } });
    history.scrollTop = 0;
    getMessages.mockImplementation(async (_id, params) => params.after !== undefined
      ? page([{ ...incoming, _id: "second", sequence: 2, body: "A new detail" }], { ...conversation, lastSequence: 2 }) : page());
    focus.mockReturnValue(true);
    await act(async () => { createConversationConnection.mock.calls[0][0].onMessage({ bookingId, message: { ...incoming, _id: "second", sequence: 2, body: "A new detail" } }); });
    await waitFor(() => expect(getMessages).toHaveBeenCalledWith(bookingId, { after: 1, limit: 50 }, expect.any(Object)));
    expect(markConversationRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "New messages — jump to latest" }));
    await waitFor(() => expect(markConversationRead).toHaveBeenCalledWith(bookingId, 2));
  });

  it("backfills a Socket sequence gap before advancing catch-up or read watermarks", async () => {
    let finishHistory;
    renderPage(); await loaded();
    await waitFor(() => expect(markConversationRead).toHaveBeenCalledWith(bookingId, 1));
    markConversationRead.mockClear();
    getMessages.mockImplementationOnce(() => new Promise(resolve => { finishHistory = resolve; }));
    await act(async () => { createConversationConnection.mock.calls[0][0].onMessage({ bookingId, message: { ...incoming, _id: "third", sequence: 3, body: "Third message hint" } }); });
    await waitFor(() => expect(getMessages).toHaveBeenCalledWith(bookingId, { after: 1, limit: 50 }, expect.any(Object)));
    expect(markConversationRead).not.toHaveBeenCalled();
    await act(async () => { finishHistory(page([
      { ...incoming, _id: "second", sequence: 2, body: "Previously missing second message" },
      { ...incoming, _id: "third", sequence: 3, body: "Third message hint" },
    ], { ...conversation, lastSequence: 3 })); });
    expect(await screen.findByText("Previously missing second message")).toBeInTheDocument();
    expect(screen.getAllByText("Third message hint")).toHaveLength(1);
    await waitFor(() => expect(markConversationRead).toHaveBeenCalledWith(bookingId, 3));
  });

  it("clears a previous presence indication when live updates stop", async () => {
    renderPage(); await loaded();
    const callbacks = createConversationConnection.mock.calls[0][0];
    await act(async () => { callbacks.onPresence({ bookingId, online: true }); });
    expect(screen.getByText("Connected here")).toBeInTheDocument();
    await act(async () => { callbacks.onState("reconnecting"); });
    expect(screen.getByText("Presence unavailable")).toBeInTheDocument();
  });

  it("recovers disconnected messages from REST on reconnection and deduplicates replay", async () => {
    focus.mockReturnValue(false);
    getMessages.mockImplementation(async (_id, params) => params.after !== undefined
      ? page([{ ...incoming, _id: "second", sequence: 2, body: "Sent while disconnected" }], { ...conversation, lastSequence: 2 }) : page());
    renderPage(); await loaded();
    await act(async () => { await createConversationConnection.mock.calls[0][0].onResync(); });
    expect(await screen.findByText("Sent while disconnected")).toBeInTheDocument();
    await act(async () => { await createConversationConnection.mock.calls[0][0].onResync(); });
    expect(screen.getAllByText("Sent while disconnected")).toHaveLength(1);
    expect(getMessages).toHaveBeenCalledWith(bookingId, { after: 1, limit: 50 }, expect.any(Object));
  });

  it("does not show another booking's history after authorization fails", async () => {
    getConversation.mockRejectedValue({ response: { status: 403, data: { message: "You cannot access this conversation." } } });
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("cannot access");
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
    expect(createConversationConnection).not.toHaveBeenCalled();
  });
});
