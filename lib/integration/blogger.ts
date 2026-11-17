import { DAOKU_BASE_SLOTS, type BloggerDistillation, type BloggerProfile } from "@/lib/bloggerWorkflow";

// Legacy callers omit desktop-only metadata. Preserve supplied slots and never infer new ones.
export function toDesktopDistillation(
  value: BloggerDistillation,
  profile: BloggerProfile,
): BloggerDistillation {
  return {
    ...value,
    id: value.id || `distill-${profile.id}`,
    bloggerId: profile.id,
    sourceLabel: value.sourceLabel || profile.name || profile.id,
    createdAt: value.createdAt || new Date().toISOString(),
    slots: value.slots ?? DAOKU_BASE_SLOTS.map((slot) => ({ ...slot })),
  };
}
