// Builds the export text: one line per card as "<name> x<quantity>", sorted by
// name (case-insensitive, locale-aware). Names come from the resolved tiles so a
// stale key with no matching card is skipped (it contributes no line).
export function buildExportText(
  entries: [string, number][],
  nameByKey: Map<string, string>,
): string {
  return entries
    .map(([key, qty]) => {
      const name = nameByKey.get(key)
      return name ? { name, qty } : null
    })
    .filter((row): row is { name: string; qty: number } => row !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((row) => `${row.name} x${row.qty}`)
    .join('\n')
}
