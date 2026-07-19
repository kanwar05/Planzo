import { motion } from "framer-motion";
import {
  Check,
  CheckCheck,
  Download,
  File,
  Trash2,
} from "lucide-react";

export const getMessageSenderId = (message) =>
  message?.sender && typeof message.sender === "object"
    ? message.sender._id
    : message?.sender;

export const isOwnChatMessage = (message, currentUserId) =>
  Boolean(currentUserId) &&
  String(getMessageSenderId(message)) === String(currentUserId);

const sameSender = (first, second) =>
  Boolean(first && second) &&
  String(getMessageSenderId(first)) === String(getMessageSenderId(second));

const messageTime = (value) =>
  value
    ? new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const hasUser = (values, userId) =>
  values?.some((value) => String(value?._id || value) === String(userId));

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unit;
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
};

// Covers emoji sequences (including skin tones, flags, ZWJ combinations), whitespace,
// and common emoji presentation selectors without enlarging ordinary punctuation.
const emojiOnlyPattern =
  /^(?:(?:\p{Extended_Pictographic}|\p{Regional_Indicator})[\p{Emoji_Modifier}\uFE0F\u200D]*|\s)+$/u;
const isEmojiOnly = (text) => Boolean(text?.trim()) && emojiOnlyPattern.test(text);

const Receipt = ({ message, otherUserId }) => {
  if (hasUser(message.seenBy, otherUserId)) {
    return (
      <span className="inline-flex items-center text-sky-300" title="Seen">
        <CheckCheck aria-label="Seen" className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (hasUser(message.deliveredTo, otherUserId)) {
    return (
      <span className="inline-flex items-center" title="Delivered">
        <CheckCheck aria-label="Delivered" className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center" title="Sent">
      <Check aria-label="Sent" className="h-3.5 w-3.5" />
    </span>
  );
};

const Avatar = ({ sender }) => {
  const name = typeof sender === "object" ? sender?.name : "";
  const avatar =
    typeof sender === "object"
      ? sender?.avatar || sender?.profileImage?.url || sender?.profileImage
      : "";

  return (
    <span
      aria-label={name ? `${name}'s avatar` : "Sender avatar"}
      className="grid h-8 w-8 shrink-0 place-items-center self-end overflow-hidden rounded-full bg-plum text-[10px] font-bold uppercase text-white dark:bg-violet-700"
    >
      {avatar ? (
        <img src={avatar} alt="" className="h-full w-full object-cover" />
      ) : (
        name?.slice(0, 2) || "?"
      )}
    </span>
  );
};

const Attachment = ({ attachment, ownMessage }) => {
  const key = attachment.publicId || attachment.url;
  if (attachment.kind === "image") {
    return (
      <a
        key={key}
        href={attachment.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${attachment.originalName || "image"} full size`}
        className="mb-1.5 block overflow-hidden rounded-xl focus:outline-none focus:ring-2 focus:ring-white/70"
      >
        <img
          src={attachment.url}
          alt={attachment.originalName || "Shared image"}
          loading="lazy"
          className="max-h-80 h-auto w-auto max-w-full object-contain transition duration-200 hover:scale-[1.01]"
        />
      </a>
    );
  }

  return (
    <a
      key={key}
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      download={attachment.originalName}
      className={`mb-1.5 flex min-w-0 items-center gap-2 rounded-xl border p-2.5 ${
        ownMessage
          ? "border-white/20 bg-white/10 hover:bg-white/15"
          : "border-gray-200 bg-white/70 hover:bg-white dark:border-slate-600 dark:bg-slate-800/70 dark:hover:bg-slate-800"
      }`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${ownMessage ? "bg-white/15" : "bg-gray-100 dark:bg-slate-700"}`}>
        <File className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {attachment.originalName || "Attachment"}
        </span>
        {attachment.size > 0 && (
          <span className={`block text-[10px] ${ownMessage ? "text-blue-100" : "text-gray-500 dark:text-slate-400"}`}>
            {formatFileSize(attachment.size)}
          </span>
        )}
      </span>
      <Download className="h-4 w-4 shrink-0" aria-label="Download" />
    </a>
  );
};

export function ChatMessageRow({
  message,
  currentUserId,
  otherUserId,
  onDelete,
  groupedWithPrevious = false,
  groupedWithNext = false,
}) {
  const ownMessage = isOwnChatMessage(message, currentUserId);
  const showAvatar = !ownMessage && !groupedWithNext;

  return (
    <motion.div
      initial={ownMessage ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      data-testid={`message-row-${message._id}`}
      data-message-id={message._id}
      className={`group flex w-full items-end gap-2 ${
        ownMessage ? "justify-end" : "justify-start"
      } ${groupedWithPrevious ? "mt-1" : "mt-3"}`}
    >
      {!ownMessage && (
        <span className="w-8 shrink-0">{showAvatar && <Avatar sender={message.sender} />}</span>
      )}
      <div
        className={`w-fit min-w-0 max-w-[85%] break-words px-3 py-2 shadow-sm sm:max-w-[65%] ${
          ownMessage
            ? `bg-blue-600 text-white  ${groupedWithNext ? "rounded-br-lg" : "rounded-br-none"} rounded-2xl`
            : `border border-gray-200 bg-gray-100 text-gray-900 ${groupedWithNext ? "rounded-bl-lg" : "rounded-bl-none"} rounded-2xl`
        }`}
      >
        {message.deletedAt ? (
          <i className="text-sm opacity-70">This message was deleted</i>
        ) : (
          <>
            {message.attachments?.map((attachment) => (
              <Attachment
                key={attachment.publicId || attachment.url}
                attachment={attachment}
                ownMessage={ownMessage}
              />
            ))}
            {message.text && (
              <p
                className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
                  isEmojiOnly(message.text) ? "text-4xl leading-tight" : "text-sm"
                }`}
              >
                {message.text}
              </p>
            )}
          </>
        )}
        <span
          className={`mt-1 flex items-center gap-1 text-[10px] leading-none ${
            ownMessage
              ? "justify-end text-blue-100"
              : "justify-start text-gray-500 "
          }`}
        >
          {messageTime(message.createdAt)}
          {ownMessage && <Receipt message={message} otherUserId={otherUserId} />}
          {ownMessage && !message.deletedAt && (
            <button
              type="button"
              aria-label="Delete message"
              onClick={() => onDelete?.(message._id)}
              className="ml-1 hidden rounded p-0.5 hover:bg-white/10 group-hover:block focus:block"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>
    </motion.div>
  );
}

export default function ChatMessageList({
  messages,
  currentUserId,
  otherUserId,
  onDelete,
}) {
  return messages.map((message, index) => (
    <ChatMessageRow
      key={message._id}
      message={message}
      currentUserId={currentUserId}
      otherUserId={otherUserId}
      onDelete={onDelete}
      groupedWithPrevious={sameSender(messages[index - 1], message)}
      groupedWithNext={sameSender(message, messages[index + 1])}
    />
  ));
}
