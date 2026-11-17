import MobileToolPage from "@/components/mobile/MobileToolPage";
import VideoGenerationStudio from "@/components/workflow/VideoGenerationStudio";

export default function MobileClipPage() {
  return <MobileToolPage title="一键出片" subtitle="传图与脚本，生成视频"><VideoGenerationStudio /></MobileToolPage>;
}
