// Production editor operations shared by controls and pointer reordering.
export function moveTask(items, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) ||
      from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return false;
  items.splice(to, 0, items.splice(from, 1)[0]);
  return true;
}
export function duplicateTask(items, index) {
  if (items.length >= 100 || !Number.isInteger(index) || !items[index]) return false;
  items.splice(index + 1, 0, structuredClone(items[index]));
  return true;
}
function counts(items) {
  const result = new Map();
  for (const item of items) {
    const owner = item.owner?.trim();
    if (owner) result.set(owner, (result.get(owner) || 0) + 1);
  }
  return result;
}
export function topAssignees(history, items, savedItems) {
  const ranked = new Map(Object.entries(history || {}));
  const saved = counts(savedItems);
  for (const [owner, count] of counts(items)) {
    ranked.set(owner, (ranked.get(owner) || 0) + Math.max(0, count - (saved.get(owner) || 0)));
  }
  return [...ranked].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3).map(([owner]) => owner);
}
