import { Composition, type CalculateMetadataFunction } from "remotion";
import { FlashCards, type FlashCardsProps } from "./FlashCards";

const FPS = 30;

// 时长由配音音频长度决定（+0.6s 收尾留白），避免画面与口播错位。
const calculateMetadata: CalculateMetadataFunction<FlashCardsProps> = ({ props }) => {
  const seconds = Math.max(4, props.audioDurationSec || 0) + 0.6;
  return {
    durationInFrames: Math.ceil(seconds * FPS),
  };
};

export const RemotionRoot = () => {
  return (
    <Composition
      id="FlashCards"
      component={FlashCards}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={FPS * 30}
      defaultProps={{
        title: "示例标题",
        hook: "别急着做，先看问题卡在哪",
        coverText: "真正卡住你的\n不是工具",
        subtitles: ["第一屏字幕", "第二屏字幕", "第三屏字幕"],
        audioUrl: "",
        audioDurationSec: 20,
        imageUrls: [],
        accent: "#D97732",
      }}
      calculateMetadata={calculateMetadata}
    />
  );
};
