/** 骨架条。宽度用 className 传，高度按行高给默认值。 */
export default function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} aria-hidden="true" />;
}

/** 多行文本骨架：最后一行短一截，模拟自然段落。 */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={`h-3.5 ${index === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}
