"use client";

import { useState, type KeyboardEvent } from "react";
import { Send, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import EnginePicker from "@/components/home/EnginePicker";
import { Textarea } from "@/components/ui/Field";

/** 示例只写「要做的事」，不写内容本身——输入框判的是去哪儿，不是写什么。 */
const EXAMPLES = [
  "把这条抖音链接拆成脚本",
  "给这篇笔记做张封面",
  "出一组电商商品图",
  "拆解一个对标博主",
  "看看上周发的数据怎么样",
];

/**
 * 首页的意图入口：一句话说清要做什么，直接落到对应的工具区。
 * 它不生成内容，只解决「这么多能力，我该点哪个」。
 */
export default function PromptHero({
  onSubmit,
  pending,
}: {
  onSubmit: (text: string) => void;
  pending: boolean;
}) {
  const [text, setText] = useState("");
  const canSubmit = Boolean(text.trim()) && !pending;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(text.trim());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-center font-rounded text-[30px] font-bold leading-tight tracking-tight text-ink md:text-[34px]">
        内容工作台 · 说一句就开工
      </h1>
      <p className="mt-2 text-center text-sm leading-6 text-muted">
        描述你要做什么，直接带你到该去的地方；也可以从下面挑一个入口。
      </p>

      <div className="mt-6 rounded-4xl border border-line bg-surface p-2.5 shadow-raised transition-colors focus-within:border-brand-300">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          placeholder="例：把这条抖音链接拆成脚本 / 给这篇笔记做封面 / 出一组电商商品图"
          className="border-0 bg-transparent px-4 py-3 focus:bg-transparent focus:ring-0"
        />
        <div className="flex flex-wrap items-center gap-2 px-2 pb-1 pt-1">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-faint">
            <Sparkles size={13} aria-hidden="true" />
            按 ⌘ + Enter 发送
          </span>
          {/* 引擎与模型选在这里，进图片工厂就是选好的——两处读写同一份偏好 */}
          <EnginePicker />
          <Button
            variant="ai"
            className="ml-auto"
            onClick={submit}
            disabled={!canSubmit}
            loading={pending}
            icon={<Send size={15} />}
          >
            {pending ? "判断中" : "发送"}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setText(example)}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-brand-300 hover:text-ink"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
