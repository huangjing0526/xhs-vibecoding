import type { ImageFactoryTemplate } from "../types";

/** 服装线的上游：先攒出一位身份固定的虚拟模特，再拿它去换装、拍场景。 */
export const MODEL_TEMPLATES: ImageFactoryTemplate[] = [
  {
    id: "model-asset",
    name: "模特资产图",
    category: "模特资产",
    description: "生成一位身份固定的模特，一次出多个视角，存进模特库后各服装模板直接复用。",
    prompt: "生成一张写实的人像模特资产图，用途是作为后续换装与场景合成的身份参考。提供模特参考图时，严格保持参考图中人物的五官、脸型、发型发色、肤色、身材比例与年龄感完全一致；没有提供参考图时，默认生成一位二十多岁的亚洲女性模特，五官自然协调、妆容清爽、身材匀称。人物穿贴身的纯色基础服装（如米色或浅灰的无花纹背心与直筒长裤），不穿任何带图案、logo 或复杂结构的衣物，不佩戴帽子、墨镜、夸张首饰等会遮挡身份特征的配饰。背景是干净均匀的浅灰色摄影棚背景，柔和均匀的影棚光，避免强烈阴影与色偏，人物完整入画、居中站立、姿态自然放松。真实照片质感，皮肤纹理与光影自然，不要插画、不要磨皮过度、不要美颜滤镜。画面中不出现文字、水印、品牌标识与拼图分格。只输出一张图。",
    aspectRatio: "3:4",
    thumb: "model-asset",
    producesModelAsset: true,
    slots: [
      { id: "model", label: "模特参考", description: "可选，传了就锁定这张脸；不传按文字描述新生成一位", required: false, fromModelLibrary: true },
    ],
    views: [
      { id: "front-full", label: "正面全身", hint: "正面平视全身，双臂自然垂放，完整露出头到脚，展示整体身材比例。" },
      { id: "side-full", label: "侧面全身", hint: "身体侧转 90 度的全身站姿，展示侧面轮廓与身形曲线，头部保持自然侧向。" },
      { id: "back-full", label: "背面全身", hint: "背面全身站姿，展示背影轮廓与发型的背面形态。" },
      { id: "half-body", label: "半身近景", hint: "腰部以上的半身正面近景，展示肩颈线条与上半身比例。" },
      { id: "face-close", label: "面部特写", hint: "正面面部特写，五官清晰、光线均匀，作为锁定人物身份的主参考。" },
    ],
    scenePresets: [
      { id: "studio-grey", label: "浅灰棚拍", prompt: "干净的浅灰色摄影棚背景，柔和均匀的影棚光，无杂物无道具，突出人物本身。" },
      { id: "studio-white", label: "纯白棚拍", prompt: "纯白色摄影棚背景，明亮通透的正面光，几乎无阴影，适合后续抠图使用。" },
      { id: "studio-warm", label: "暖调棚拍", prompt: "米色背景纸的摄影棚，暖调柔光从侧上方打下，肤色温润自然。" },
    ],
    builtIn: true,
  },
  {
    id: "model-poses",
    name: "模特姿势拓展",
    category: "模特资产",
    description: "拿一张已定妆的模特图，锁死身份扩出更多姿势，补齐模特库。",
    prompt: "基于参考图中的模特生成一张新姿势的写实人像。严格保持参考图中人物的五官、脸型、发型发色、肤色、身材比例与所处年龄段完全一致，这是同一个人，不得换脸、不得改变身材、不得改变发型长度与颜色。严格保持参考图中的服装款式、颜色、版型与细节不变，只改变人物的姿态与取景。姿态自然，重心、关节角度与衣物褶皱符合真实人体的物理关系，手脚完整不残缺、不畸形。背景与光线延续参考图的风格，保持同一场景的连贯感。真实照片质感，画面中不出现文字、水印、品牌标识，不要把多个姿势拼进同一张图。只输出一张图。",
    aspectRatio: "3:4",
    thumb: "model-poses",
    producesModelAsset: true,
    slots: [
      { id: "model", label: "模特图", description: "已定妆的模特照，用于锁定人物身份与服装", required: true, fromModelLibrary: true },
      { id: "style", label: "场景参考", description: "可选，用于确定背景与拍摄风格", required: false },
    ],
    views: [
      { id: "stand-front", label: "站姿正面", hint: "正面站立，双臂自然垂放或一手轻搭身侧，眼神看向镜头。" },
      { id: "walking", label: "行走中", hint: "向前迈步的行走姿态，抓拍感，衣摆与头发有轻微动势。" },
      { id: "sitting", label: "坐姿", hint: "自然坐姿，双腿交叠或并拢，上半身放松，取景到膝盖以上。" },
      { id: "look-back", label: "回头", hint: "身体背向或侧向镜头，头部回转看向镜头，展示侧后方轮廓。" },
      { id: "hand-gesture", label: "手部动作", hint: "半身取景，一手自然抬起做整理头发或衣领的动作，手部结构清晰。" },
    ],
    scenePresets: [
      { id: "keep-origin", label: "沿用原图场景", prompt: "背景与光线完全沿用参考图，保持同一场拍摄的连贯感。" },
      { id: "studio-plain", label: "纯色棚拍", prompt: "干净的浅灰或米色背景棚拍，柔和均匀的影棚光，突出人物姿态。" },
      { id: "window-light", label: "窗边自然光", prompt: "室内落地窗边，自然光从侧面洒入，白色窗帘与绿植点缀，光影柔和干净。" },
      { id: "city-street", label: "城市街拍", prompt: "都市街道平视拍摄，背景是街铺与虚化的行人，日常通勤感，光线自然。" },
    ],
    builtIn: true,
  },
];
