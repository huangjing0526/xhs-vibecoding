"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, Cpu, Send, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import EnginePicker from "@/components/home/EnginePicker";
import { Textarea } from "@/components/ui/Field";

/**
 * 示例即捷径：点了直接按关键词规则路由过去，不花一次 AI 往返。
 * 落点不写死在这里——判断权在 lib/intentRouting 的同一张规则表，两边不会各说各话。
 */
const EXAMPLES = [
  "把这条抖音链接拆成脚本",
  "给这篇笔记做张封面",
  "出一组电商商品图",
  "拆解一个对标博主",
  "看看上周发的数据怎么样",
];

/** 工具栏开关与示例 chip 共用的胶囊皮肤，尺寸字号由各自补。 */
const PILL =
  "rounded-full border border-line bg-surface font-semibold text-muted transition-colors hover:border-brand-300 hover:text-ink";

/**
 * 首页的意图入口：一句话说清要做什么，直接落到对应的工具区。
 * 它不生成内容，只解决「这么多能力，我该点哪个」。
 */
export default function PromptHero({
  onSubmit,
  onPickExample,
  pending,
}: {
  onSubmit: (text: string) => void;
  onPickExample: (text: string) => void;
  pending: boolean;
}) {
  const [text, setText] = useState("");
  const [engineOpen, setEngineOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = Boolean(text.trim()) && !pending;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(text.trim());
  };

  // 输入框跟着内容长高，别一上来就占三行把下面的入口挤出首屏。
  // 跟着 text 走而不是跟着键盘事件走：将来清空或预填时高度不会卡在旧值上。
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing：中文输入法里 Enter 是在选字，不是要发送
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
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
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="今天要做什么？"
          className="max-h-40 border-0 bg-transparent px-4 py-3 focus:bg-transparent focus:ring-0"
        />
        <div className="flex flex-wrap items-center gap-2 px-2 pb-1 pt-1">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-faint">
            <Sparkles size={13} aria-hidden="true" />
            Enter 发送 · Shift + Enter 换行
          </span>
          {/* 引擎与模型只管出图，默认收起，别让人以为它影响这句话怎么被理解 */}
          <button
            type="button"
            onClick={() => setEngineOpen((open) => !open)}
            aria-expanded={engineOpen}
            className={`${PILL} flex items-center gap-1 px-2.5 py-1 text-[11px]`}
          >
            <Cpu size={13} aria-hidden="true" />
            出图引擎
            <ChevronDown
              size={12}
              aria-hidden="true"
              className={`transition-transform ${engineOpen ? "rotate-180" : ""}`}
            />
          </button>
          {engineOpen && <EnginePicker />}
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
            onClick={() => onPickExample(example)}
            className={`${PILL} px-3 py-1.5 text-xs`}
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
