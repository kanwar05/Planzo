import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Button from "../components/Button";
import ConversationBookingSummary from "../components/ConversationBookingSummary";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { createConversationConnection } from "../services/conversationConnection";
import { getConversation, getMessages, markConversationRead, sendMessage } from "../services/messagingService";
import { getApiError } from "../utils/apiError";
import { clearMessageIntent, readMessageIntent, storeMessageIntent } from "../utils/messageIntent";
import { mergeConversation, mergeMessages, messageTime } from "../utils/messages";
import { getDashboardPath } from "../utils/navigation";

const notifyCounts = () => window.dispatchEvent(new Event("planzo:messages-updated"));
const isVisible = () => document.visibilityState !== "hidden" && document.hasFocus();
const nearBottom = node => !node || node.scrollHeight - node.scrollTop - node.clientHeight < 72;
const connectionLabels = {
  connecting: "Connecting live updates…", connected: "Live updates connected",
  reconnecting: "Live updates reconnecting. Your saved history will refresh automatically.",
  unavailable: "Live updates are unavailable. You can still send messages and refresh saved history.",
  offline: "You appear to be offline. Keep this page open and retry any unconfirmed message when connected.",
};

export default function BookingConversationPage() {
  const { bookingId } = useParams();
  const { user } = useAuth();
  return <Conversation key={`${user?._id || ""}:${bookingId}`} bookingId={bookingId} user={user} />;
}

function Conversation({ bookingId, user }) {
  useDocumentTitle("Booking messages");
  const [booking, setBooking] = useState(null), [conversation, setConversation] = useState(null), [messages, setMessages] = useState([]);
  const [confirmedSequence, setConfirmedSequence] = useState(0);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [retry, setRetry] = useState(0);
  const [historyError, setHistoryError] = useState(""), [readError, setReadError] = useState(""), [sendError, setSendError] = useState("");
  const [olderCursor, setOlderCursor] = useState(null), [loadingOlder, setLoadingOlder] = useState(false), [syncing, setSyncing] = useState(false);
  const [draft, setDraft] = useState(""), [pending, setPending] = useState(null), [sending, setSending] = useState(false);
  const [connectionState, setConnectionState] = useState("connecting"), [peerOnline, setPeerOnline] = useState(null), [typing, setTyping] = useState(false), [newBelow, setNewBelow] = useState(false);
  const scope = useRef(null), model = useRef({}), scroller = useRef(null), attempt = useRef(null), sendLock = useRef(false), readLock = useRef(false), syncLock = useRef(false);
  const connection = useRef(null), forceBottom = useRef(true), restoreScroll = useRef(null), typingTimer = useRef(null), typingSentAt = useRef(0);
  const fetchedSequence = useRef(0), catchupTimer = useRef(null);
  model.current = { booking, conversation, messages, confirmedSequence };

  useEffect(() => {
    const current = { active: true, controller: new AbortController() };
    scope.current = current;
    setLoading(true); setLoadError(""); setMessages([]); setBooking(null); setConversation(null);
    fetchedSequence.current = 0; setConfirmedSequence(0);
    setHistoryError(""); setReadError(""); setSendError(""); setOlderCursor(null); setNewBelow(false);
    const saved = readMessageIntent(user?._id, bookingId);
    attempt.current = saved; setPending(saved); setDraft(saved?.body || ""); forceBottom.current = true;
    sendLock.current = false; readLock.current = false; syncLock.current = false;
    Promise.all([
      getConversation(bookingId, { signal: current.controller.signal }),
      getMessages(bookingId, { limit: 50 }, { signal: current.controller.signal }),
    ]).then(([details, history]) => {
      if (!current.active) return;
      setBooking(details.booking); setConversation(mergeConversation(details.conversation, history.conversation));
      const rows = mergeMessages([], history.messages || []);
      setMessages(rows); fetchedSequence.current = rows.at(-1)?.sequence || 0; setConfirmedSequence(fetchedSequence.current);
      setOlderCursor(history.pagination?.hasMore ? history.pagination.nextBefore : null);
    }).catch(error => { if (current.active) setLoadError(getApiError(error, "Unable to load this conversation.")); })
      .finally(() => { if (current.active) setLoading(false); });
    return () => { current.active = false; current.controller.abort(); };
  }, [bookingId, user?._id, retry]);

  const maybeRead = useCallback(async () => {
    const current = scope.current, data = model.current;
    const through = Math.min(data.messages?.at(-1)?.sequence || 0, data.confirmedSequence || 0);
    if (!current?.active || !data.conversation || readLock.current || !isVisible() || !nearBottom(scroller.current) || through <= (data.conversation.selfReadSequence || 0)) return;
    readLock.current = true;
    try {
      const response = await markConversationRead(bookingId, through);
      if (current.active) { setConversation(value => mergeConversation(value, response.conversation)); setReadError(""); notifyCounts(); }
    } catch { if (current.active) setReadError("Your read receipt could not be updated. It will retry when you return or refresh."); }
    finally { if (scope.current === current) readLock.current = false; }
  }, [bookingId]);

  const append = useCallback(rows => {
    if (!rows.length) return;
    if (nearBottom(scroller.current)) forceBottom.current = true;
    else setNewBelow(true);
    setMessages(value => mergeMessages(value, rows));
  }, []);

  const sync = useCallback(async () => {
    const current = scope.current;
    if (!current?.active || !model.current.booking || syncLock.current) return;
    syncLock.current = true; setSyncing(true);
    try {
      const details = await getConversation(bookingId, { signal: current.controller.signal });
      if (!current.active) return;
      setBooking(details.booking); setConversation(value => mergeConversation(value, details.conversation));
      let after = fetchedSequence.current;
      // Bound each catch-up pass; the next poll continues from the saved sequence.
      for (let page = 0; page < 5; page += 1) {
        const result = await getMessages(bookingId, { after, limit: 50 }, { signal: current.controller.signal });
        if (!current.active) return;
        const rows = mergeMessages([], result.messages || []);
        append(rows); setConversation(value => mergeConversation(value, result.conversation));
        let next = after;
        for (const row of rows) {
          if (row.sequence === next + 1) next = row.sequence;
          else if (row.sequence > next + 1) break;
        }
        fetchedSequence.current = next; setConfirmedSequence(value => Math.max(value, next));
        if (!result.pagination?.hasMore || !next || next <= after) break;
        after = next;
      }
      setHistoryError("");
    } catch (error) {
      if (current.active) {
        if ([401, 403].includes(error.response?.status)) { setLoadError(getApiError(error, "This conversation is no longer available.")); setMessages([]); setBooking(null); setConversation(null); }
        else setHistoryError(getApiError(error, "New messages could not be checked. Your saved history remains here."));
      }
    }
    finally { if (current.active) setSyncing(false); if (scope.current === current) syncLock.current = false; }
  }, [append, bookingId]);

  const ready = !loading && Boolean(booking) && !loadError;
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const refresh = () => { if (document.visibilityState !== "hidden") { sync(); maybeRead(); } };
    const scheduleCatchup = () => {
      clearTimeout(catchupTimer.current);
      catchupTimer.current = setTimeout(() => { if (active) sync(); }, 250);
    };
    connection.current = createConversationConnection({ bookingId,
      onState: value => { if (active) { setConnectionState(value); if (value !== "connected") { setPeerOnline(null); setTyping(false); } } },
      onMessage: event => { if (active) { append([event.message]); scheduleCatchup(); notifyCounts(); } },
      onRead: event => {
        if (!active || !Number.isSafeInteger(event.readThroughSequence) || event.readThroughSequence < 0) return;
        setConversation(value => value ? { ...value,
          ...(event.readerRole === value.selfRole
            ? { selfReadSequence: Math.max(value.selfReadSequence || 0, event.readThroughSequence), readAt: event.readAt }
            : { peerReadSequence: Math.max(value.peerReadSequence || 0, event.readThroughSequence), peerReadAt: event.readAt }),
        } : value);
      },
      onPresence: event => { if (active) setPeerOnline(event.online); },
      onTyping: event => {
        if (!active) return;
        clearTimeout(typingTimer.current); setTyping(event.isTyping === true);
        if (event.isTyping) typingTimer.current = setTimeout(() => { if (active) setTyping(false); }, 5000);
      },
      onResync: refresh,
    });
    const offline = () => { setConnectionState("offline"); setPeerOnline(null); setTyping(false); };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh); window.addEventListener("online", refresh); window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false; clearInterval(timer); clearTimeout(typingTimer.current); clearTimeout(catchupTimer.current); connection.current?.close(); connection.current = null;
      window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", refresh);
    };
  }, [ready, bookingId, append, maybeRead, sync]);

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    if (restoreScroll.current) {
      node.scrollTop = node.scrollHeight - restoreScroll.current.height + restoreScroll.current.top;
      restoreScroll.current = null;
    } else if (forceBottom.current) { node.scrollTop = node.scrollHeight; forceBottom.current = false; setNewBelow(false); }
  }, [messages, ready]);
  useEffect(() => { if (ready) maybeRead(); }, [messages, confirmedSequence, conversation?.selfReadSequence, ready, maybeRead]);
  useEffect(() => {
    const current = attempt.current;
    if (current && messages.some(message => message.senderRole === conversation?.selfRole && message.clientMessageId === current.clientMessageId)) {
      attempt.current = null; setPending(null); setDraft(""); setSendError(""); clearMessageIntent(user?._id, bookingId);
    }
  }, [messages, conversation?.selfRole, bookingId, user?._id]);

  const older = async () => {
    if (!olderCursor || loadingOlder) return;
    const current = scope.current;
    setLoadingOlder(true); setHistoryError("");
    try {
      const response = await getMessages(bookingId, { before: olderCursor, limit: 50 }, { signal: current.controller.signal });
      if (!current.active) return;
      restoreScroll.current = { height: scroller.current?.scrollHeight || 0, top: scroller.current?.scrollTop || 0 };
      setMessages(value => mergeMessages(value, response.messages || []));
      setOlderCursor(response.pagination?.hasMore ? response.pagination.nextBefore : null);
    } catch (error) { if (current.active) setHistoryError(getApiError(error, "Earlier messages could not be loaded.")); }
    finally { if (current.active) setLoadingOlder(false); }
  };
  const submit = async event => {
    event.preventDefault();
    if (sendLock.current || (!conversation?.canSend && !attempt.current)) return;
    const retrying = Boolean(attempt.current), current = scope.current;
    const text = draft.trim();
    if (!retrying && (!text || text.length > 4000 || new TextEncoder().encode(text).length > 16000)) { setSendError("Write a message of 1 to 4,000 characters."); return; }
    const intent = attempt.current || { clientMessageId: crypto.randomUUID(), body: text };
    attempt.current = intent; setPending(intent); storeMessageIntent(user?._id, bookingId, intent);
    sendLock.current = true; setSending(true); setSendError(""); connection.current?.typing(false);
    try {
      const response = await sendMessage(bookingId, intent);
      clearMessageIntent(user?._id, bookingId);
      if (current.active) {
        forceBottom.current = true; append([response.message]); setConversation(value => mergeConversation(value, response.conversation));
        attempt.current = null; setPending(null); setDraft(""); notifyCounts();
      }
    } catch (error) {
      if (!current.active) return;
      if (model.current.messages.some(message => message.senderRole === conversation?.selfRole && message.clientMessageId === intent.clientMessageId)) return;
      if (!retrying && [400, 401, 403, 404, 409, 422, 429].includes(error.response?.status)) {
        attempt.current = null; setPending(null); clearMessageIntent(user?._id, bookingId);
      }
      setSendError(getApiError(error, "Delivery could not be confirmed. Retry the same message."));
    } finally { if (scope.current === current) sendLock.current = false; if (current.active) setSending(false); }
  };
  const canSend = conversation?.canSend === true && ["pending", "accepted"].includes(booking?.status) && user?.emailVerified === true;
  const jump = () => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; setNewBelow(false); maybeRead(); };
  if (loading) return <div className="space-y-5"><h1 className="font-editorial text-4xl">Booking messages</h1><LoadingSkeleton /></div>;
  if (loadError || !booking) return <div className="space-y-5"><h1 className="font-editorial text-4xl">Booking messages</h1><p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{loadError || "This conversation is unavailable."}</p><Button onClick={() => setRetry(value => value + 1)}>Try again</Button><Button to={getDashboardPath(user?.role)} variant="outline">Back to bookings</Button></div>;
  return <div className="mx-auto max-w-4xl space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-coral">Booking conversation</p><h1 className="mt-2 break-words font-editorial text-3xl sm:text-4xl">Messages with {conversation?.peer?.name || (user?.role === "vendor" ? "your customer" : "your vendor")}</h1><p className="mt-2 text-xs text-ink/65">{peerOnline === true ? "Connected here" : peerOnline === false ? "Not connected here" : "Presence unavailable"}</p></div><Button to={getDashboardPath(user?.role)} variant="outline">Back to bookings</Button></header>
    <ConversationBookingSummary booking={booking} />
    <section aria-label="Booking messages" className="min-w-0 overflow-hidden rounded-2xl border border-ink/10 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-4 py-3"><p role="status" className="max-w-xl text-xs leading-6 text-ink/65">{connectionLabels[connectionState]}</p><Button variant="ghost" loading={syncing} onClick={sync} className="!px-3 !text-xs">Refresh messages</Button></div>
      {(historyError || readError) && <div className="space-y-1 border-b border-ink/10 bg-sand p-3 text-xs leading-6"><p role="alert">{historyError || readError}</p></div>}
      {olderCursor && <div className="border-b border-ink/10 p-2 text-center"><Button variant="ghost" loading={loadingOlder} onClick={older}>Load earlier messages</Button></div>}
      <div ref={scroller} role="log" aria-label="Conversation history" aria-live="polite" aria-relevant="additions" tabIndex={0} onFocus={maybeRead} onScroll={() => { if (nearBottom(scroller.current)) { setNewBelow(false); maybeRead(); } }} className="h-[min(60vh,36rem)] min-h-64 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
        {!messages.length && <p className="py-10 text-center text-sm leading-7 text-ink/65">No messages yet. Use this conversation to coordinate the booking.</p>}
        {messages.map(message => {
          const own = message.senderRole === conversation?.selfRole;
          return <article key={message._id} aria-label={`${own ? "Your" : "Received"} message ${message.sequence}`} className={`max-w-[92%] rounded-2xl p-3.5 sm:max-w-[80%] sm:p-4 ${own ? "ml-auto bg-sage/65" : "mr-auto bg-sand"}`}><p className="mb-1 text-[11px] font-semibold text-ink/65">{own ? "You" : conversation?.peer?.name || "Booking participant"}</p><p className="whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">{message.body}</p><p className="mt-2 flex flex-wrap justify-end gap-x-3 gap-y-1 text-[10px] leading-5 text-ink/65"><time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>{own && <span>{message.sequence <= (conversation?.peerReadSequence || 0) ? "Read" : "Sent"}</span>}</p></article>;
        })}
      </div>
      {newBelow && <div className="border-t border-ink/10 p-2 text-center"><Button variant="outline" onClick={jump}>New messages — jump to latest</Button></div>}
      <p role="status" className="min-h-7 px-4 text-xs text-ink/65">{typing ? `${conversation?.peer?.name || "The other participant"} is typing…` : ""}</p>
      <div className="border-t border-ink/10 p-4 sm:p-5">
        {!canSend && <p className="mb-3 rounded-xl bg-sand p-3 text-xs leading-6">{!["pending", "accepted"].includes(booking.status) ? "This booking is closed. Conversation history remains available to its participants." : user?.emailVerified !== true ? "Verify your email to send a message. You can still read this conversation." : "Messaging is unavailable while a participant's account is unavailable."}</p>}
        {(canSend || pending) && <form onSubmit={submit} className="space-y-3">
          {sendError && <p role="alert" className="text-sm text-red-800">{sendError}</p>}
          {pending && !sending && <p role="status" className="rounded-xl bg-sand p-3 text-xs leading-6">Delivery of your previous message is unconfirmed. Retry this exact message before writing another. This attempt is retained in this browser tab until confirmed.</p>}
          <label className="block"><span className="label">Message</span><textarea rows={3} maxLength={4000} required value={draft} disabled={sending || Boolean(pending) || !canSend} onFocus={maybeRead} onBlur={() => connection.current?.typing(false)} onChange={event => {
            setDraft(event.target.value);
            if (Date.now() - typingSentAt.current > 1500) { typingSentAt.current = Date.now(); connection.current?.typing(Boolean(event.target.value.trim())); }
          }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} className="field min-w-0 resize-y" /></label>
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-ink/65">{draft.length}/4,000 · Ctrl/⌘ + Enter to send</span><Button type="submit" loading={sending} disabled={sending || (!pending && (!canSend || !draft.trim()))}>{pending && !sending ? "Retry message" : "Send message"}</Button></div>
        </form>}
      </div>
    </section>
    <p className="text-xs leading-6 text-ink/65">Messages are private to this booking's customer and vendor. Avoid sharing passwords, OTPs or payment card details.</p>
  </div>;
}
