import { AREAS, type AreaId } from "@/lib/capabilities";

/** 区图标的唯一出口：图标本身声明在能力目录里，新增区时类型层会强制补齐。 */
export default function NavIcon({ id, size = 17 }: { id: AreaId; size?: number }) {
  const Icon = AREAS[id].icon;
  return <Icon size={size} strokeWidth={1.9} aria-hidden="true" />;
}
