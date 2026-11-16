export function mergeMessages(current, incoming) {
  const bySequence = new Map();
  for (const message of [...current, ...incoming]) {
    if (message && typeof message._id === "string" && Number.isSafeInteger(message.sequence) && message.sequence > 0 && typeof message.body === "string")
      bySequence.set(message.sequence, message);
  }
  return [...bySequence.values()].sort((left, right) => left.sequence - right.sequence);
}

export function mergeConversation(current, next) {
  if (!current) return next;
  if (!next) return current;
  return { ...current, ...next,
    lastSequence: Math.max(current.lastSequence || 0, next.lastSequence || 0),
    selfReadSequence: Math.max(current.selfReadSequence || 0, next.selfReadSequence || 0),
    peerReadSequence: Math.max(current.peerReadSequence || 0, next.peerReadSequence || 0),
  };
}

export function messageTime(value) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? `${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date)} UTC`
    : "Time unavailable";
}
