// Minimal denylist for the most common profanity/slurs in review text.
// Not exhaustive by design - the moderation queue (reports + admin hide) is the backstop
// for anything that slips past this or isn't a clean word-for-word match.
const BLOCKED_WORDS = [
  "fuck", "fuc", "shit", "bitch", "asshole", "bastard", "cunt", "dick", "piss", "whore"
];

const BLOCKED_PATTERN = new RegExp(`\\b(${BLOCKED_WORDS.join("|")})\\b`, "i");

const containsBlockedContent = (text = "") => BLOCKED_PATTERN.test(text);

module.exports = { containsBlockedContent };
