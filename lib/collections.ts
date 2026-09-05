/**
 * 按 key 归组，保持首次出现的顺序。
 * 图片工厂里「按分类排 tab」「按模特名归档」「按产出归组结果」是同一件事，
 * 各写一遍循环只会让三处慢慢长歪。
 */
export function groupInOrder<T, K>(items: T[], keyOf: (item: T) => K): Array<{ key: K; items: T[] }> {
  const groups: Array<{ key: K; items: T[] }> = [];
  items.forEach((item) => {
    const key = keyOf(item);
    const group = groups.find((entry) => entry.key === key);
    if (group) group.items.push(item);
    else groups.push({ key, items: [item] });
  });
  return groups;
}

/** 按 createdAt 倒序的通用比较器：作品、产物这类「新的在前」列表共用，别各写一遍 localeCompare。 */
export function byCreatedAtDesc(left: { createdAt: string }, right: { createdAt: string }): number {
  return right.createdAt.localeCompare(left.createdAt);
}
