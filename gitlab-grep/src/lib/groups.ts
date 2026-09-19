import type { GitLabGroup, TopLevelGroup } from "./types";

const STORAGE_KEY = "gitlab-grep-selected-groups";

/** グループをトップレベルで集約 */
export function aggregateGroups(groups: GitLabGroup[]): TopLevelGroup[] {
  const map = new Map<string, TopLevelGroup>();

  for (const g of groups) {
    const topName = g.full_path.split("/")[0];
    if (!map.has(topName)) {
      map.set(topName, { name: topName, id: g.id, subgroups: [] });
    }
    const top = map.get(topName)!;
    // トップレベルグループ自体のIDを使う（サブグループではなく）
    if (g.full_path === topName) {
      top.id = g.id;
    }
    top.subgroups.push(g);
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function saveSelectedGroups(groupIds: number[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groupIds));
}

export function loadSelectedGroups(): number[] | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}
