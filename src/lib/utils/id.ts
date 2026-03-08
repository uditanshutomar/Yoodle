import { customAlphabet } from "nanoid";

/**
 * Alphabet used for meeting code segments.
 * Lowercase letters and digits, excluding easily-confused characters (0, o, l, 1).
 */
const MEETING_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

const generateSegment = customAlphabet(MEETING_CODE_ALPHABET, 3);

/**
 * Generate a meeting join code in the format "yoo-xxx-xxx".
 *
 * Each segment is 3 characters drawn from a 30-char alphabet,
 * giving ~27 000 combinations per segment and ~729 million unique codes.
 *
 * @example
 * generateMeetingCode() // => "yoo-dkf-plm"
 */
export function generateMeetingCode(): string {
  return `yoo-${generateSegment()}-${generateSegment()}`;
}
