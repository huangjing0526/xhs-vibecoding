import type { ImageFactoryTemplate } from "../types";

/**
 * 内容配图：产出去向是笔记、封面、视频，不是商详页。
 * 和「详情图」的分界不在画面里有什么，而在质感与坑位——
 * 手机随手拍的物品图归这里，商业棚拍的物品图归详情图。
 */
export const CONTENT_TEMPLATES: ImageFactoryTemplate[] = [
  {
    id: "cover-base",
    name: "封面底图",
    category: "内容配图",
    description: "生成留好叠字位置的封面底图，标题在编辑器里叠，字不会糊。",
    prompt: "生成一张小红书封面用的底图。画面要有明确的视觉主体与氛围，但必须按指定视角在画面里留出一整块干净、低对比、无碎细节的区域用来后期叠标题文字，这块区域不能被主体、强纹理或高光切碎。整体色调统一、观感高级，主体清晰不杂乱。画面里绝对不能出现任何文字、字母、数字、水印、logo 与贴纸——标题由后期叠加。只输出一张底图。",
    aspectRatio: "3:4",
    thumb: "cover-base",
    handoff: "cover",
    slots: [
      { id: "subject", label: "主体图", description: "可选，封面里要出现的主体（商品 / 人物 / 场景）", required: false },
      { id: "style", label: "风格参考", description: "可选，用于确定配色、材质与氛围", required: false },
    ],
    views: [
      { id: "top-space", label: "上方留白", hint: "主体压在画面下半部，上方三分之一留出干净的叠字区。" },
      { id: "bottom-space", label: "下方留白", hint: "主体占据画面上半部，下方三分之一留出干净的叠字区。" },
      { id: "side-space", label: "侧边留白", hint: "主体偏向画面一侧，另一侧整条留出干净的竖向叠字区。" },
    ],
    scenePresets: [
      { id: "clean-desk", label: "干净桌面", prompt: "浅色桌面俯拍，物件摆放克制，大片留白，自然光柔和。" },
      { id: "morning-window", label: "晨光窗边", prompt: "窗边晨光，白色窗纱透光，浅暖色调，空气感强。" },
      { id: "soft-gradient", label: "柔和渐变", prompt: "低饱和的柔和渐变背景，只有光影层次没有具体物件，极简高级。" },
      { id: "paper-texture", label: "纸张质感", prompt: "米白纸张质感铺满画面，细微纤维纹理与浅浅的折痕阴影。" },
      { id: "night-warm", label: "夜晚暖光", prompt: "夜晚室内，暖色台灯打亮一角，背景沉入深色，情绪安静。" },
      { id: "outdoor-green", label: "户外绿意", prompt: "户外绿植前的自然光，背景虚化成柔和的绿色块面，清新通透。" },
    ],
    builtIn: true,
  },
  {
    id: "note-flatlay",
    name: "笔记实拍配图",
    category: "内容配图",
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
    category: "内容配图",
    description: "对着镜头说话的瞬间，用作笔记首图或视频封面。",
    prompt: "生成一张人物出镜的场景图。严格保持人物参考图中的脸、发型、肤色、体型，以及服装的颜色、版型与细节完全不变；只改变环境、姿态与光线。人物面向镜头、神态自然，像是在对着镜头说话的瞬间，嘴部与眼神状态放松不僵硬。光线打在脸上均匀柔和，背景有真实的空间纵深与轻微虚化，人物与背景的光线方向一致。画面中不出现文字、水印、字幕条与品牌标识。只输出一张真实、可直接发布的成图。",
    aspectRatio: "3:4",
    thumb: "talking-head",
    preview: "/template-previews/talking-head.jpg",
    slots: [
      { id: "person", label: "人物参考图", description: "用于锁定出镜人的脸、发型与服装", required: true, fromModelLibrary: true },
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
  {
    id: "brand-kit",
    name: "品牌视觉包",
    category: "内容配图",
    description: "从一张参考图提炼视觉语言，出一组留白的封面底图与背景。",
    prompt: "从参考图提炼一套统一的视觉语言，生成可复用的素材。保持参考图的配色、材质感、光线氛围与构图逻辑；不要复制参考图中的人物、文字、logo 或任何独特标识。画面要留出足够干净的空白区域，方便后续叠加标题与文字。质感真实细腻，避免塑料感与过度渲染。画面中不出现任何文字、水印与品牌标识。只输出一张图片。",
    aspectRatio: "3:4",
    thumb: "brand-kit",
    preview: "/template-previews/brand-kit.jpg",
    slots: [
      { id: "reference", label: "视觉参考", description: "用于提炼配色、材质与氛围的参考图", required: true },
    ],
    views: [
      { id: "hero", label: "主视觉", hint: "可作封面底图的主视觉画面，主体偏一侧，中心或上方留出叠字空间", preview: "/template-previews/brand-kit__hero.jpg" },
      { id: "backdrop", label: "纯背景", hint: "几乎没有主体的纯背景底图，只有材质与光影层次，整片可叠字", preview: "/template-previews/brand-kit__backdrop.jpg" },
      { id: "texture", label: "局部纹理", hint: "材质或纹理的近距离特写，可作分隔条与点缀元素", preview: "/template-previews/brand-kit__texture.jpg" },
      { id: "ambience", label: "氛围延展", hint: "同一视觉语言下的场景氛围图，用于系列内容的第二第三张", preview: "/template-previews/brand-kit__ambience.jpg" },
    ],
    builtIn: true,
  },
];
