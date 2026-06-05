// ============================================================================
// roleLabel — DISPLAY-ONLY capitalization for role strings.
// ----------------------------------------------------------------------------
// The raw data stores roles lowercased (e.g. "attacker", "disruption",
// "energy-accel"). Those raw values are what the filter param (?role=…), the
// facet option VALUE, and the #/role/:role drill-down route all match against —
// so they MUST stay raw everywhere they drive logic.
//
// This helper produces a friendlier LABEL for the user-facing text only: each
// hyphen-separated word is capitalized ("attacker" → "Attacker",
// "energy-accel" → "Energy-Accel"). Callers render formatRoleLabel(value) for
// display while continuing to pass the raw `value` to links/params/filters.
// ============================================================================
export function formatRoleLabel(role: string): string {
  return role
    .split('-')
    .map((word) =>
      word.length === 0 ? word : word[0].toUpperCase() + word.slice(1),
    )
    .join('-')
}
