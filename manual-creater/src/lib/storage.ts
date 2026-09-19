// --- Profile ---

const PROFILE_KEY = "manual-creater:profile";

export interface UserProfile {
  author: string;
  defaultEnvironment: string;
  ticketPrefix: string;
}

const DEFAULT_PROFILE: UserProfile = {
  author: "",
  defaultEnvironment: "",
  ticketPrefix: "",
};

function isValidProfile(data: unknown): data is UserProfile {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.author === "string" &&
    typeof d.defaultEnvironment === "string" &&
    typeof d.ticketPrefix === "string"
  );
}

function parseJson<T>(
  raw: string,
  validate: (data: unknown) => data is T,
): T | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadProfile(): UserProfile {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return DEFAULT_PROFILE;
  const profile = parseJson(raw, isValidProfile);
  return profile ?? DEFAULT_PROFILE;
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
