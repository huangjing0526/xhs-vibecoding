import type { ImageFactoryTemplate } from "../types";

/** 服装线的上游：先攒出一位身份固定的虚拟模特，再拿它去换装、拍场景。 */
export const MODEL_TEMPLATES: ImageFactoryTemplate[] = [
  {
    id: "model-asset",
    name: "模特资产图",
    category: "模特资产",
    description: "一位模特的整套身份资产：九宫格头部角度与表情、定妆主图、全身三视图。存进模特库后各服装模板直接复用。",
    prompt: "生成一张写实的人像模特资产图，用途是作为后续换装与场景合成的身份基准，因此身份一致性优先于画面美感。提供模特参考图或身份描述时，严格保持五官比例、脸型与下颌线、发型发色与发缝位置、肤色与年龄感、身材比例完全一致，包括参考图里嘴角高低这类轻微的自然不对称——这是同一个人，不得换脸、不得美化五官、不得改变脸宽与下巴长度。没有提供参考时，默认生成一位二十多岁的亚洲女性模特，五官自然协调。固定造型：奶油色或浅灰的素色针织上衣与同色系直筒长裤，无图案、无 logo、无首饰、无帽子墨镜等遮挡身份的配饰。暖白无缝影棚背景，大面积近相机轴柔光，无强投影无色偏。真实照片质感：保留毛孔、绒毛与轻微肤色起伏，哑光到缎光皮肤，额头、鼻尖与颧骨不得出现成片高光；不磨皮、不美颜、不做插画或 CG 渲染。画面中不出现文字、水印、品牌标识。一次只输出当前这一个视角的一张图，绝对不要把多个角度拼进同一张图。",
    aspectRatio: "3:4",
    thumb: "model-asset",
    preview: "/template-previews/model-asset.jpg",
    producesAsset: "models",
    libraryFirst: true,
    slots: [
      { id: "model", label: "模特参考", description: "可选，传了就锁定这张脸；不传按文字描述新生成一位", required: false, fromModelLibrary: true },
    ],
    // 规格来自实拍档案的做法：九宫格头部锁身份，定妆主图当门面，全身三视图供换装用。
    // 头肩近景走横幅、全身走竖幅，各自带自己的画幅，不迁就模板那个统一比例。
    views: [
      { id: "head-front", group: "头部九宫格", label: "正面头肩", hint: "严格正面头肩近景，视线看向镜头，表情自然放松，作为锁定身份的主锚点。", aspectRatio: "16:9", preview: "/template-previews/model-asset__head-front.jpg" },
      { id: "head-left-45", group: "头部九宫格", label: "左转 45°", hint: "头部向人物自身左侧转 45 度的头肩近景，视线跟随转向，五官仍清晰可读。", aspectRatio: "16:9", preview: "/template-previews/model-asset__head-left-45.jpg" },
      { id: "head-right-45", group: "头部九宫格", label: "右转 45°", hint: "头部向人物自身右侧转 45 度的头肩近景，与左侧 45 度严格对称同一张脸。", aspectRatio: "16:9", preview: "/template-previews/model-asset__head-right-45.jpg" },
      { id: "head-left-profile", group: "头部九宫格", label: "左正侧脸", hint: "向人物自身左侧转 90 度的正侧脸，展示鼻梁、唇形与下颌的侧面轮廓线。", aspectRatio: "16:9", preview: "/template-previews/model-asset__head-left-profile.jpg" },
      { id: "head-right-profile", group: "头部九宫格", label: "右正侧脸", hint: "向人物自身右侧转 90 度的正侧脸，与左侧脸保持同一套骨相。", aspectRatio: "16:9", preview: "/template-previews/model-asset__head-right-profile.jpg" },
      { id: "head-up", group: "头部九宫格", label: "微抬头", hint: "头部上抬约 15 度的头肩近景，展示下颌与颈部的连接关系。", aspectRatio: "16:9", preview: "/template-previews/model-asset__head-up.jpg" },
      { id: "head-down", group: "头部九宫格", label: "微低头", hint: "头部下压约 15 度的头肩近景，视线略向下，展示眼睑与额头的形态。", aspectRatio: "16:9", preview: "/template-previews/model-asset__head-down.jpg" },
      { id: "expression-smile", group: "头部九宫格", label: "柔和微笑", hint: "正面头肩近景的不露齿微笑，只改变嘴角、面颊与下眼睑，头部角度与光线保持不变。", aspectRatio: "16:9", preview: "/template-previews/model-asset__expression-smile.jpg" },
      { id: "expression-eyes-closed", group: "头部九宫格", label: "闭眼", hint: "正面头肩近景的自然闭眼，睫毛与眼睑形态清晰，其余一切保持不变。", aspectRatio: "16:9", preview: "/template-previews/model-asset__expression-eyes-closed.jpg" },
      { id: "key-visual", group: "定妆主图", label: "定妆主图", hint: "腰部以上的半身定妆照，身体略侧、脸转向镜头，是这位模特对外的门面图。", aspectRatio: "3:4", preview: "/template-previews/model-asset__key-visual.jpg" },
      { id: "body-front", group: "全身三视图", label: "正面全身", hint: "正面平视全身站姿，双臂自然垂放，头到脚完整入画，展示整体身材比例。", aspectRatio: "9:16", preview: "/template-previews/model-asset__body-front.jpg" },
      { id: "body-side", group: "全身三视图", label: "侧面全身", hint: "身体侧转 90 度的全身站姿，展示侧面轮廓与身形曲线。", aspectRatio: "9:16", preview: "/template-previews/model-asset__body-side.jpg" },
      { id: "body-back", group: "全身三视图", label: "背面全身", hint: "背面全身站姿，展示背影轮廓与发型的背面形态。", aspectRatio: "9:16", preview: "/template-previews/model-asset__body-back.jpg" },
    ],
    scenePresets: [
      { id: "studio-warm-white", label: "暖白棚拍", prompt: "暖白色无缝影棚背景，大面积近相机轴柔光，几乎无投影，肤色温润自然。" },
      { id: "studio-grey", label: "浅灰棚拍", prompt: "干净的浅灰色摄影棚背景，柔和均匀的影棚光，无杂物无道具，突出人物本身。" },
      { id: "studio-white", label: "纯白棚拍", prompt: "纯白色摄影棚背景，明亮通透的正面光，几乎无阴影，适合后续抠图使用。" },
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
    preview: "/template-previews/model-poses.jpg",
    producesAsset: "models",
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
