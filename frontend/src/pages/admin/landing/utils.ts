export const moveItem = <T,>(items: T[], from: number, to: number): T[] => {
  if (from === to) return items;
  if (from < 0 || from >= items.length) return items;
  if (to < 0 || to >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

export const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

