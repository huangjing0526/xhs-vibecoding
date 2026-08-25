import type { ImageFactoryTemplate } from "../types";

/** 小红书笔记用的实拍感配图与出镜帧。 */
export const XHS_TEMPLATES: ImageFactoryTemplate[] = [
  {
    id: "note-flatlay",
    name: "笔记实拍配图",
    category: "小红书",
    description: "手机随手拍质感的物品场景图，用作笔记内页配图。",
    prompt: "生成一张真实的实拍感配图。严格保持参考图中主体物品的外形、颜色、材质与所有细节完全不变；只改变它所处的环境、摆放方式与光线。画面要像手机随手拍下的真实照片，有自然的光影、轻微的景深和真实的材质反光，不要塑料感或过度渲染的效果。构图干净，主体清晰，周围陈设服务于主体、不喧宾夺主。画面中若出现手部，默认为亚洲人的手，肤色自然。画面中不出现文字、水印、可辨认的品牌标识与促销标签，不臆造参考图中没有的部件。只输出一张真实、可直接发布的成图。",
    aspectRatio: "3:4",
    thumb: "note-flatlay",
    preview: "/template-previews/note-flatlay.jpg",
    slots: [
      { id: "subject", label: "主体物品", description: "配图里必须保留的主体", required: true },
      { id: "style", label: "风格参考", description: "可选，用于确定色调与摆拍风格", required: false },
    ],
    scenePresets: [
      { id: "wood-desk-top", label: "木桌俯拍", prompt: "原木桌面正上方俯拍，物品居中摆放，旁边留出大片空木纹，自然光。" },
      { id: "linen-bed", label: "床品摊开", prompt: "米白色床品上随意摊开，布料有自然褶皱，晨间侧光洒进来。" },
      { id: "window-light", label: "窗边自然光", prompt: "窗边台面，自然光从侧面进来，窗框的影子落在桌面上，通透明亮。" },
      { id: "in-hand", label: "手持特写", prompt: "手持物品的近距离特写，手部姿态自然，背景虚化成干净的室内色块。" },
      { id: "coffee-corner", label: "咖啡桌一角", prompt: "咖啡桌的一角，旁边有半杯咖啡与一本翻开的书，暖调灯光，生活气息。" },
      { id: "carpet", label: "地毯上", prompt: "浅色地毯上随意放置，毛绒质感明显，光线柔和偏暖。" },
      { id: "work-desk", label: "书桌工作台", prompt: "书桌工作台，旁边有笔记本、笔与绿植，白天的自然光，整洁不刻意。" },
      { id: "vanity", label: "梳妆台", prompt: "梳妆台台面，背景有镜面与化妆品的柔和反光，暖白灯光。" },
      { id: "shelf", label: "置物架", prompt: "浅色置物架上，与几件简单摆件同框，层次干净，柔和顶光。" },
      { id: "snapshot", label: "随手抓拍", prompt: "非精心构图的随手抓拍，轻微的手持角度，真实的日常感光线。" },
    ],
    builtIn: true,
  },
  {
    id: "talking-head",
    name: "人物出镜帧",
    category: "小红书",
    description: "对着镜头说话的瞬间，用作笔记首图或视频封面。",
    prompt: "生成一张人物出镜的场景图。严格保持人物参考图中的脸、发型、肤色、体型，以及服装的颜色、版型与细节完全不变；只改变环境、姿态与光线。人物面向镜头、神态自然，像是在对着镜头说话的瞬间，嘴部与眼神状态放松不僵硬。光线打在脸上均匀柔和，背景有真实的空间纵深与轻微虚化，人物与背景的光线方向一致。画面中不出现文字、水印、字幕条与品牌标识。只输出一张真实、可直接发布的成图。",
    aspectRatio: "3:4",
    thumb: "talking-head",
    preview: "/template-previews/talking-head.jpg",
    slots: [
      { id: "person", label: "人物参考图", description: "用于锁定出镜人的脸、发型与服装", required: true },
      { id: "style", label: "场景参考", description: "可选，用于确定背景与色调", required: false },
    ],
    scenePresets: [
      { id: "desk-front", label: "书桌前", prompt: "坐在书桌前对着镜头说话，背景是书架与绿植，暖白灯光，半身构图。" },
      { id: "sofa-home", label: "沙发居家", prompt: "居家沙发上，背景是抱枕与暖色落地灯，光线柔和，姿态放松。" },
      { id: "plain-wall", label: "纯色白墙", prompt: "干净的浅色墙面前，柔和均匀的正面光，背景极简，注意力全在人物身上。" },
      { id: "bookshelf", label: "书架背景", prompt: "站在书架前，书脊层次丰富但虚化，暖调室内光，知识分享感。" },
      { id: "kitchen", label: "厨房料理台", prompt: "厨房料理台前，背景有干净的橱柜与几件厨具，自然光明亮。" },
      { id: "window-side", label: "窗边光", prompt: "靠窗而坐，自然光从侧面打在脸上，窗外是虚化的绿意，通透明亮。" },
      { id: "office", label: "办公工位", prompt: "办公工位前，背景是显示器与文件收纳，冷白光，专业干练。" },
      { id: "vanity-mirror", label: "化妆台", prompt: "化妆台前，镜面灯提供均匀正面光，背景是化妆品与镜子的柔和反光。" },
      { id: "outdoor-cafe", label: "户外咖啡", prompt: "户外咖啡座，背景是街景与绿植的虚化，自然光柔和，日常松弛。" },
      { id: "in-car-seat", label: "车内", prompt: "驾驶座或副驾上对着镜头说话，车窗外是虚化街景，光线自然通透。" },
    ],
    builtIn: true,
  },
];
