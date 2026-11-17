import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * 成片合成：画面素材铺满全屏，底部压字幕条，配上口播音轨。
 *
 * 素材可以是生成出来的视频片段，也可以是用户直接传的静态图——后者靠缓慢推近
 * （Ken Burns）让画面不至于死板。同一个组合吃两种素材，是因为除了"这一屏放什么"之外，
 * 字幕、音轨、时长分配的逻辑完全一样，拆成两个组合只会让两边慢慢长歪。
 */
export type ClipSlide = {
  type: "video" | "image";
  src: string;
  /**
   * 这一屏占多少秒。混合剪辑必须指定：数字人片段要严格盖住它对应的那段配音，
   * 早一秒晚一秒口型就对不上。不指定的屏平分剩余时长。
   */
  durationSec?: number;
};

/** 字幕条目。durationSec 由产线按各段配音的实际时长和字数算好，见 script.mjs。 */
export type ClipSubtitle = { text: string; durationSec?: number };

export type ClipReelProps = {
  slides: ClipSlide[];
  subtitles: ClipSubtitle[];
  audioUrl: string;
  audioDurationSec: number;
  accent: string;
};

export const ClipReel: React.FC<ClipReelProps> = ({ slides, subtitles, audioUrl, accent }) => {
  const { durationInFrames, fps } = useVideoConfig();

  const slideTimeline = layoutTimeline(slides, durationInFrames, fps);
  const subtitleTimeline = layoutTimeline(subtitles, durationInFrames, fps);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {audioUrl ? <Audio src={audioUrl} /> : null}

      {slideTimeline.map(({ item, from, frames }, index) => (
        <Sequence key={`slide-${index}`} from={from} durationInFrames={frames}>
          <Slide slide={item} durationInFrames={frames} />
        </Sequence>
      ))}

      {subtitleTimeline.map(({ item, from, frames }, index) => (
        <Sequence key={`sub-${index}`} from={from} durationInFrames={frames}>
          <SubtitleBar text={item.text} accent={accent} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

/**
 * 排时间轴：定了时长的按定的来，其余平分剩下的。画面和字幕用的是同一套规则。
 *
 * 最后一项兜到整条结尾——逐项取整会累出几帧误差，落在末尾就是一闪而过的黑屏。
 */
function layoutTimeline<T extends { durationSec?: number }>(
  items: T[],
  durationInFrames: number,
  fps: number
) {
  const fixedFrames = items.reduce(
    (sum, item) => sum + (item.durationSec ? Math.round(item.durationSec * fps) : 0),
    0
  );
  const flexCount = items.filter((item) => !item.durationSec).length;
  const flexFrames =
    flexCount > 0 ? Math.max(fps, Math.floor((durationInFrames - fixedFrames) / flexCount)) : 0;

  let cursor = 0;
  return items.map((item, index) => {
    const isLast = index === items.length - 1;
    const own = item.durationSec ? Math.round(item.durationSec * fps) : flexFrames;
    const frames = isLast ? Math.max(1, durationInFrames - cursor) : own;
    const from = cursor;
    cursor += frames;
    return { item, from, frames };
  });
}

/** 静态图做 8% 的缓慢推近；视频素材本身就在动，不再叠运镜免得晃。 */
function Slide({ slide, durationInFrames }: { slide: ClipSlide; durationInFrames: number }) {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.08], { extrapolateRight: "clamp" });
  const fill = { width: "100%", height: "100%", objectFit: "cover" } as const;

  if (slide.type === "video") {
    return (
      <AbsoluteFill>
        <OffthreadVideo src={slide.src} muted style={fill} />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img src={slide.src} style={{ ...fill, transform: `scale(${scale})` }} />
    </AbsoluteFill>
  );
}

/** 字幕条：半透明黑底保证任何画面上都读得清，入场做一点淡入避免硬切。 */
function SubtitleBar({ text, accent }: { text: string; accent: string }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 220 }}>
      <div
        style={{
          opacity,
          maxWidth: 900,
          padding: "24px 36px",
          borderRadius: 20,
          backgroundColor: "rgba(0, 0, 0, 0.62)",
          borderBottom: `6px solid ${accent}`,
          color: "#fff",
          fontSize: 56,
          lineHeight: 1.35,
          fontWeight: 800,
          textAlign: "center",
          fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}
