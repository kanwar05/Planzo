const DEFAULT_PROFANITY = ["fuck", "shit", "bitch", "asshole", "bastard"];
const PROFANITY = (process.env.REVIEW_PROFANITY_WORDS || DEFAULT_PROFANITY.join(","))
  .split(",")
  .map((word) => word.trim().toLowerCase())
  .filter(Boolean);

const normalize = (value = "") =>
  String(value).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

const repeatedContent = (text) => {
  const words = text.split(" ").filter(Boolean);
  if (words.length < 6) return false;
  return new Set(words).size / words.length < 0.35;
};

export const inspectReviewText = (value) => {
  const text = normalize(value);
  const profanity = PROFANITY.filter((word) =>
    new RegExp(`(^|\\s)${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i").test(text),
  );
  const links = (String(value).match(/https?:\/\/|www\./gi) || []).length;
  const excessiveCaps =
    String(value).replace(/[^A-Za-z]/g, "").length >= 20 &&
    String(value).replace(/[^A-Z]/g, "").length /
      String(value).replace(/[^A-Za-z]/g, "").length > 0.75;
  const spamReasons = [
    links > 1 && "multiple_links",
    repeatedContent(text) && "repetitive_text",
    excessiveCaps && "excessive_capitals",
  ].filter(Boolean);

  return {
    profanity,
    spamReasons,
    shouldFlag: profanity.length > 0 || spamReasons.length > 0,
  };
};

export const historyEntry = ({ action, actor, fromStatus, toStatus, reason, details }) => ({
  action,
  actorId: actor?._id || actor || null,
  actorRole: actor?.role || "system",
  fromStatus: fromStatus || null,
  toStatus: toStatus || null,
  reason: reason || null,
  details: details || null,
  createdAt: new Date(),
});
