import type { ContentImagePlan } from "./imageWorkflow";
import type { VideoPlan } from "./videoWorkflow";

/** 一个项目在本机存的产出（见 app/api/notes/assets）。null = 生成过又清掉了。 */
export interface NoteAssets {
  contentImagePlan?: ContentImagePlan | null;
  videoPlan?: VideoPlan | null;
}
