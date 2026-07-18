import { Check, CheckCheck, File, Trash2 } from "lucide-react";

export const getMessageSenderId = (message) =>
  message?.sender && typeof message.sender === "object"
    ? message.sender._id
    : message?.sender;

export const isOwnChatMessage = (message, currentUserId) =>
  Boolean(currentUserId) &&
  String(getMessageSenderId(message)) === String(currentUserId);

const messageTime = (value) =>
  value
    ? new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const hasUser = (values, userId) =>
  values?.some((value) => String(value?._id || value) === String(userId));

const Receipt = ({ message, otherUserId }) => {
  if (hasUser(message.seenBy, otherUserId)) {
    return <CheckCheck aria-label="Seen" className="h-3.5 w-3.5 text-blue-200" />;
  }
  if (hasUser(message.deliveredTo, otherUserId)) {
    return <CheckCheck aria-label="Delivered" className="h-3.5 w-3.5" />;
  }
  return <Check aria-label="Sent" className="h-3.5 w-3.5" />;
};

export function ChatMessageRow({
  message,
  currentUserId,
  otherUserId,
  onDelete,
}) {
  const ownMessage = isOwnChatMessage(message, currentUserId);

  return (
    <div
      data-testid={`message-row-${message._id}`}
      data-message-id={message._id}
      className={`group mb-3 flex w-full ${
        ownMessage ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[75%] break-words px-3 py-2 shadow-sm md:max-w-[65%] ${
          ownMessage
            ? "rounded-l-2xl rounded-tr-2xl rounded-br-md bg-emerald-600 text-white"
            : "rounded-r-2xl rounded-tl-2xl rounded-bl-md bg-white text-gray-900"
        }`}
      >
        {message.deletedAt ? (
          <i className="text-sm opacity-65">This message was deleted</i>
        ) : (
          <>
            {message.attachments?.map((attachment) =>
              attachment.kind === "image" ? (
                <a key={attachment.publicId} href={attachment.url} target="_blank" rel="noreferrer">
                  <img src={attachment.url} alt={attachment.originalName} className="mb-2 max-h-72 max-w-full rounded-xl object-cover" />
                </a>
              ) : (
                <a key={attachment.publicId} href={attachment.url} target="_blank" rel="noreferrer" className="mb-2 flex min-w-0 items-center gap-2 rounded-xl bg-black/10 p-3">
                  <File className="h-5 w-5 shrink-0" />
                  <span className="truncate">{attachment.originalName}</span>
                </a>
              ),
            )}
            {message.text && (
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">
                {message.text}
              </p>
            )}
          </>
        )}
        <span className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
          {messageTime(message.createdAt)}
          {ownMessage && <Receipt message={message} otherUserId={otherUserId} />}
          {ownMessage && !message.deletedAt && (
            <button type="button" aria-label="Delete message" onClick={() => onDelete?.(message._id)} className="ml-1 hidden group-hover:block focus:block">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

export default function ChatMessageList({
  messages,
  currentUserId,
  otherUserId,
  onDelete,
}) {
  return messages.map((message) => (
    <ChatMessageRow
      key={message._id}
      message={message}
      currentUserId={currentUserId}
      otherUserId={otherUserId}
      onDelete={onDelete}
    />
  ));
}
