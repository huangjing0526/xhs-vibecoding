import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface FlashCardsProps {
  title: string;
  hook: string;
  coverText: string;
  subtitles: string[];
  audioUrl: string;
  audioDurationSec: number;
  imageUrls: string[];
  accent: string;
}

const PAPER = "#FBF7F0";
const INK = "#161616";
const MUTED = "#7B746B";

function FadeIn({
  children,
  durationInFrames,
}: {
  children: React.ReactNode;
  durationInFrames: number;
}) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const outStart = Math.max(12, durationInFrames - 10);
  const fadeOut = interpolate(frame, [outStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(frame, [0, 14], [24, 0], { extrapolateRight: "clamp" });
  return (
    <div style={{ opacity: Math.min(opacity, fadeOut), transform: `translateY(${translateY}px)` }}>
      {children}
    </div>
  );
}

export const FlashCards: React.FC<FlashCardsProps> = ({
  hook,
  coverText,
  subtitles,
  audioUrl,
  imageUrls,
  accent,
}) => {
  const { durationInFrames, width } = useVideoConfig();

  const coverFrames = Math.round(durationInFrames * 0.16);
  const sceneCount = Math.max(1, subtitles.length);
  const sceneFrames = Math.floor((durationInFrames - coverFrames) / sceneCount);

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER, fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif' }}>
      {/* 暖白纸感边框 */}
      <AbsoluteFill style={{ border: `36px solid #F1E7DC`, pointerEvents: "none" }} />

      {audioUrl ? <Audio src={audioUrl} /> : null}

      {/* 封面屏 */}
      <Sequence durationInFrames={coverFrames}>
        <AbsoluteFill style={{ padding: 96, justifyContent: "center" }}>
          <FadeIn durationInFrames={coverFrames}>
            <div
              style={{
                display: "inline-block",
                padding: "10px 22px",
                borderRadius: 12,
                backgroundColor: `${accent}1A`,
                color: accent,
                fontSize: 30,
                fontWeight: 700,
              }}
            >
              小红书 · 图文快闪
            </div>
            <div
              style={{
                marginTop: 48,
                fontSize: 104,
                lineHeight: 1.18,
                fontWeight: 900,
                color: INK,
                whiteSpace: "pre-wrap",
              }}
            >
              {coverText}
            </div>
            <div style={{ marginTop: 40, width: 156, height: 14, borderRadius: 6, backgroundColor: accent }} />
            <div style={{ marginTop: 36, fontSize: 44, fontWeight: 700, color: MUTED, lineHeight: 1.4 }}>
              {hook}
            </div>
          </FadeIn>
        </AbsoluteFill>
      </Sequence>

      {/* 逐屏字幕 */}
      {subtitles.map((subtitle, index) => {
        const from = coverFrames + index * sceneFrames;
        const img = imageUrls[index];
        return (
          <Sequence key={index} from={from} durationInFrames={sceneFrames}>
            <AbsoluteFill style={{ padding: 96, justifyContent: "center" }}>
              {img ? (
                <AbsoluteFill>
                  <Img src={img} style={{ width, height: "100%", objectFit: "cover", opacity: 0.16 }} />
                </AbsoluteFill>
              ) : null}
              <FadeIn durationInFrames={sceneFrames}>
                <div style={{ fontSize: 34, fontWeight: 700, color: accent }}>
                  0{index + 1}
                </div>
                <div
                  style={{
                    marginTop: 28,
                    fontSize: 72,
                    lineHeight: 1.32,
                    fontWeight: 900,
                    color: INK,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {subtitle}
                </div>
              </FadeIn>
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* 底部进度条 */}
      <BottomProgress accent={accent} />
    </AbsoluteFill>
  );
};

function BottomProgress({ accent }: { accent: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ position: "absolute", left: 96, right: 96, bottom: 120 }}>
      <div style={{ height: 8, borderRadius: 4, backgroundColor: "#EAE0D4", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${progress * 100}%`, backgroundColor: accent }} />
      </div>
    </div>
  );
}
