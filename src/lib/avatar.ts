/** Member profile avatars: the approved set shipped by the main platform, whitelisted by key. */
export const AVATARS: Record<string, string> = {
  cyber_02: "Violet cyber",
  alien_01: "Magenta alien",
  cyber_01: "Cyan cyber",
  robot_02: "Blue robot",
  neon_01: "Green neon",
  neon_02: "Pink neon",
  pixel_01: "Orange pixel",
  robot_01: "Gold robot",
};

/** Whitelist check: never trust a stored/browser value as a file name. */
export function avatarIsValid(a: string | null | undefined): boolean {
  return a != null && a !== "" && Object.hasOwn(AVATARS, a);
}

/** The member's avatar key if whitelisted, else null (Web3Edu cube shown instead). */
export function avatarOf(member: { avatar?: string | null } | null | undefined): string | null {
  const a = member?.avatar ?? "";
  return avatarIsValid(a) ? (a as string) : null;
}
