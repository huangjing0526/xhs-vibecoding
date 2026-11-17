"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Sparkles, Layers, User, type LucideIcon } from "lucide-react";

interface TabDef {
  href: string;
  label: string;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { href: "/m", label: "首页", icon: Home },
  { href: "/m/create", label: "创作", icon: Sparkles },
  { href: "/m/works", label: "作品", icon: Layers },
  { href: "/m/me", label: "我的", icon: User },
];

/** 首页只有精确匹配才算选中，否则它会在所有 /m/* 下都亮着。 */
function isActive(pathname: string, href: string): boolean {
  return href === "/m" ? pathname === "/m" : pathname.startsWith(href);
}

/** 底部主导航：四个 tab 常驻，能力二级页盖在它上面（自带返回）。 */
export default function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-[520px] items-stretch pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 transition-colors ${
                active ? "text-brand-500" : "text-faint"
              }`}
            >
              <Icon size={21} strokeWidth={active ? 2.4 : 1.9} aria-hidden="true" />
              <span className="text-[10px] font-bold leading-none">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
