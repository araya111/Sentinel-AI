export const DEFAULT_ROOM = 'live';

const ROOM_REGEX = /^[a-zA-Z0-9_-]{2,24}$/;

/**
 * Sanitizes an incoming room identifier.
 * Validates /^[a-zA-Z0-9_-]{2,24}$/, trims whitespace, and falls back cleanly to 'live'.
 */
export function sanitizeRoom(raw?: string | null): string {
  if (!raw) return DEFAULT_ROOM;
  const trimmed = raw.trim();
  if (ROOM_REGEX.test(trimmed)) {
    return trimmed;
  }
  return DEFAULT_ROOM;
}

/**
 * Translates a room name to its dedicated AppSync Events channel.
 * e.g. "live" -> "/sentinel/live", "stage-7392" -> "/sentinel/stage-7392"
 */
export function roomToChannel(room: string): string {
  return `/sentinel/${sanitizeRoom(room)}`;
}
