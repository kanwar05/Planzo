import {
  ArrowLeft,
  ImagePlus,
  Menu,
  Paperclip,
  Search,
  Send,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import ChatMessageList from "../components/ChatMessageList";
import { useAuth } from "../context/AuthContext";
import {
  createConversation,
  deleteConversation,
  deleteMessage,
  getChatSocket,
  getMessages,
  listConversations,
  markConversationRead,
  sendAttachmentMessage,
} from "../services/chatService";
import { getApiError } from "../utils/apiError";

const emojis = ["😀", "😂", "😍", "👍", "🙏", "🎉", "❤️", "😊", "🔥", "✅"];
const time = (value) =>
  value
    ? new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

export default function ChatPage() {
  const { conversationId } = useParams();
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const messagesBase = user?.role === "vendor" ? "/vendor/messages" : "/messages";
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(conversationId || "");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [search, setSearch] = useState("");
  const [typing, setTyping] = useState(false);
  const [presence, setPresence] = useState({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [listOpen, setListOpen] = useState(!conversationId);
  const endRef = useRef(null);
  const typingTimer = useRef(null);
  const socket = useMemo(getChatSocket, []);
  const active = conversations.find((item) => item._id === activeId);
  const other = active?.participants.find((item) => item._id !== user?._id);
  const myState = (conversation) =>
    conversation.participantStates?.find(
      (state) => String(state.user?._id || state.user) === String(user?._id),
    );

  const loadList = async () => {
    const data = await listConversations();
    setConversations(data.conversations);
    return data.conversations;
  };
  useEffect(() => {
    let live = true;
    setLoading(true);
    (async () => {
      try {
        let list = await loadList();
        const bookingId = query.get("bookingId");
        const participantId = query.get("participantId");
        if (bookingId || participantId) {
          const created = await createConversation(
            bookingId ? { bookingId } : { participantId },
          );
          if (!list.some((x) => x._id === created._id)) list = await loadList();
          setActiveId(created._id);
          navigate(`${messagesBase}/${created._id}`, { replace: true });
        } else if (conversationId) setActiveId(conversationId);
      } catch (e) {
        if (live) setError(getApiError(e, "Unable to load chats."));
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    socket.connect();
    const onNew = (message) => {
      setMessages((current) =>
        message.conversation === activeId &&
        !current.some((x) => x._id === message._id)
          ? [...current, message]
          : current,
      );
      loadList().catch(() => {});
      if (
        message.conversation === activeId &&
        message.sender?._id !== user?._id
      )
        socket.emit("message:seen", { conversationId: activeId });
    };
    const onSeen = ({ conversationId: id, userId, seenAt }) => {
      if (id === activeId)
        setMessages((current) =>
          current.map((message) =>
            message.sender?._id === user?._id
              ? {
                  ...message,
                  seenBy: [...new Set([...(message.seenBy || []), userId])],
                  seenAt,
                }
              : message,
          ),
        );
    };
    const onDelivered = ({ conversationId: id, userId, deliveredAt }) => {
      if (id === activeId)
        setMessages((current) =>
          current.map((message) =>
            message.sender?._id === user?._id
              ? {
                  ...message,
                  deliveredTo: [
                    ...new Set([...(message.deliveredTo || []), userId]),
                  ],
                  deliveredAt,
                }
              : message,
          ),
        );
    };
    const onTyping = ({ conversationId: id, typing: value }) => {
      if (id === activeId) setTyping(value);
    };
    const onPresence = ({ userId, status, lastSeenAt }) =>
      setPresence((current) => ({
        ...current,
        [userId]: { status, lastSeenAt },
      }));
    const onDeleted = ({ conversationId: id, messageId, deletedAt }) => {
      if (id === activeId)
        setMessages((current) =>
          current.map((message) =>
            message._id === messageId
              ? { ...message, text: "", attachments: [], deletedAt }
              : message,
          ),
        );
    };
    socket.on("message:new", onNew);
    socket.on("message:seen", onSeen);
    socket.on("message:delivered", onDelivered);
    socket.on("typing:update", onTyping);
    socket.on("presence:update", onPresence);
    socket.on("message:deleted", onDeleted);
    return () => {
      socket.off("message:new", onNew);
      socket.off("message:seen", onSeen);
      socket.off("message:delivered", onDelivered);
      socket.off("typing:update", onTyping);
      socket.off("presence:update", onPresence);
      socket.off("message:deleted", onDeleted);
      socket.disconnect();
    };
  }, [activeId, user?._id]);
  useEffect(() => {
    if (!activeId) return setMessages([]);
    setLoading(true);
    getMessages(activeId, search ? { search } : {})
      .then((data) => {
        setMessages(data.messages);
        socket.emit("conversation:join", { conversationId: activeId });
        socket.emit("message:seen", { conversationId: activeId });
        markConversationRead(activeId).catch(() => {});
        setListOpen(false);
      })
      .catch((e) => setError(getApiError(e, "Unable to load messages.")))
      .finally(() => setLoading(false));
    return () =>
      socket.emit("conversation:leave", { conversationId: activeId });
  }, [activeId, search]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, typing]);
  useEffect(() => {
    const ids = conversations
      .flatMap((item) => item.participants.map((person) => person._id))
      .filter((id) => id !== user?._id);
    socket.emit("presence:query", ids, (result) => {
      if (result?.success)
        setPresence(
          Object.fromEntries(result.presence.map((x) => [x.userId, x])),
        );
    });
  }, [conversations, socket.connected]);

  const select = (id) => {
    setActiveId(id);
    setSearch("");
    navigate(`${messagesBase}/${id}`);
  };
  const type = (value) => {
    setText(value);
    if (!activeId) return;
    socket.emit("typing:start", { conversationId: activeId });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(
      () => socket.emit("typing:stop", { conversationId: activeId }),
      900,
    );
  };
  const send = async () => {
    if ((!text.trim() && !files.length) || !activeId) return;
    setSending(true);
    socket.emit("typing:stop", { conversationId: activeId });
    try {
      if (files.length) {
        const message = await sendAttachmentMessage(
          activeId,
          text.trim(),
          files,
        );
        setMessages((current) =>
          current.some((x) => x._id === message._id)
            ? current
            : [...current, message],
        );
      } else
        await new Promise((resolve, reject) =>
          socket.emit(
            "message:send",
            { conversationId: activeId, text: text.trim() },
            (result) =>
              result?.success
                ? resolve(result)
                : reject(new Error(result?.message || "Send failed.")),
          ),
        );
      setText("");
      setFiles([]);
      setEmojiOpen(false);
    } catch (e) {
      setError(getApiError(e, e.message || "Unable to send message."));
    } finally {
      setSending(false);
    }
  };
  const removeConversation = async () => {
    if (!window.confirm("Remove this conversation from your list?")) return;
    await deleteConversation(activeId);
    setConversations((current) => current.filter((x) => x._id !== activeId));
    setActiveId("");
    navigate(messagesBase);
    setListOpen(true);
  };
  const removeMessage = async (id) => {
    try {
      const deleted = await deleteMessage(id);
      setMessages((current) =>
        current.map((x) => (x._id === id ? deleted : x)),
      );
    } catch (e) {
      setError(getApiError(e, "Unable to delete message."));
    }
  };
  const statusText = other
    ? presence[other._id]?.status === "online"
      ? "online"
      : other.lastSeenAt
        ? `last seen ${new Date(other.lastSeenAt).toLocaleString()}`
        : "offline"
    : "";
  return (
    <section className="container-shell py-5">
      <Toast message={error} type="error" onClose={() => setError("")} />
      <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-7xl overflow-hidden rounded-[1.75rem] border bg-white shadow-soft">
        <aside
          className={`${listOpen ? "flex" : "hidden"} w-full flex-col border-r md:flex md:w-80 lg:w-96`}
        >
          <div className="border-b p-5">
            <h1 className="text-2xl font-extrabold">Messages</h1>
            <p className="text-sm text-ink/45">
              Booking conversations and direct chats
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && !conversations.length ? (
              <div className="p-4">
                <LoadingSkeleton />
              </div>
            ) : conversations.length ? (
              conversations.map((conversation) => {
                const person = conversation.participants.find(
                  (x) => x._id !== user?._id,
                );
                const unread = myState(conversation)?.unreadCount || 0;
                return (
                  <button
                    key={conversation._id}
                    onClick={() => select(conversation._id)}
                    className={`flex w-full gap-3 border-b p-4 text-left hover:bg-sand/40 ${activeId === conversation._id ? "bg-plum/5" : ""}`}
                  >
                    <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-plum text-sm font-bold text-white">
                      {person?.name?.slice(0, 2).toUpperCase()}
                      <i
                        className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${presence[person?._id]?.status === "online" ? "bg-emerald-500" : "bg-slate-300"}`}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex justify-between gap-2">
                        <b className="truncate">{person?.name}</b>
                        <small>{time(conversation.lastMessageAt)}</small>
                      </span>
                      <span className="flex justify-between gap-2">
                        <span className="truncate text-sm text-ink/45">
                          {conversation.booking
                            ? `${conversation.booking.eventType}: `
                            : ""}
                          {conversation.lastMessage?.deletedAt
                            ? "Message deleted"
                            : conversation.lastMessage?.text ||
                              (conversation.lastMessage?.attachments?.length
                                ? "Attachment"
                                : "No messages yet")}
                        </span>
                        {unread > 0 && (
                          <b className="rounded-full bg-coral px-2 py-0.5 text-xs text-white">
                            {unread}
                          </b>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="p-5">
                <EmptyState
                  title="No conversations"
                  description="Open a booking and start a chat with your vendor or customer."
                />
              </div>
            )}
          </div>
        </aside>
        <main
          className={`${!listOpen ? "flex" : "hidden"} min-w-0 flex-1 flex-col md:flex`}
        >
          {active ? (
            <>
              <header className="flex items-center gap-3 border-b p-4">
                <button className="md:hidden" onClick={() => setListOpen(true)}>
                  <ArrowLeft />
                </button>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-plum text-sm font-bold text-white">
                  {other?.name?.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <b>{other?.name}</b>
                  <p className="truncate text-xs text-ink/45">
                    {typing ? "typing…" : statusText}
                  </p>
                </div>
                <label className="relative hidden sm:block">
                  <Search className="absolute left-3 top-2.5 h-4 w-4" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="rounded-full border py-2 pl-9 pr-3 text-sm"
                    placeholder="Search messages"
                  />
                </label>
                <button
                  onClick={removeConversation}
                  title="Delete conversation"
                >
                  <Trash2 className="h-5 w-5 text-red-500" />
                </button>
              </header>
              <div className="flex-1 overflow-y-auto bg-sand/25 p-4">
                {loading ? (
                  <LoadingSkeleton />
                ) : (
                  <ChatMessageList
                    messages={messages}
                    currentUserId={user?._id}
                    otherUserId={other?._id}
                    onDelete={removeMessage}
                  />
                )}
                <div ref={endRef} />
              </div>
              {files.length > 0 && (
                <div className="flex gap-2 overflow-x-auto border-t px-4 py-2">
                  {files.map((file) => (
                    <span
                      key={`${file.name}:${file.size}`}
                      className="flex items-center gap-1 rounded-full bg-sand px-3 py-1 text-xs"
                    >
                      {file.name}
                      <button
                        onClick={() =>
                          setFiles((current) =>
                            current.filter((x) => x !== file),
                          )
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <footer className="relative flex items-end gap-2 border-t p-3">
                <button onClick={() => setEmojiOpen((x) => !x)}>
                  <Smile />
                </button>
                {emojiOpen && (
                  <div className="absolute bottom-16 left-3 grid grid-cols-5 gap-2 rounded-xl border bg-white p-3 shadow-xl">
                    {emojis.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => type(text + emoji)}
                        className="text-xl"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
                <label className="cursor-pointer">
                  <Paperclip />
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx"
                    onChange={(e) =>
                      setFiles(Array.from(e.target.files || []).slice(0, 5))
                    }
                  />
                </label>
                <textarea
                  value={text}
                  onChange={(e) => type(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  className="field min-h-11 flex-1 resize-none !rounded-2xl"
                  rows="1"
                  placeholder="Type a message"
                />
                <Button
                  onClick={send}
                  disabled={sending || (!text.trim() && !files.length)}
                  className="!rounded-full !p-3"
                >
                  <Send className="h-5 w-5" />
                </Button>
              </footer>
            </>
          ) : (
            <div className="grid h-full place-items-center p-8">
              <EmptyState
                title="Select a conversation"
                description="Choose a chat to start messaging."
              />
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
