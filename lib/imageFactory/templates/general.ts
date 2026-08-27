import type { ImageFactoryTemplate } from "../types";

/** 通用：不绑定主体也不绑定坑位，任何素材都能进，从零起图的也归这里；自建模板默认也落这一类。 */
export const GENERAL_TEMPLATES: ImageFactoryTemplate[] = [
  {
    id: "style-transfer",
    name: "风格复刻",
    category: "通用与自建",
    description: "保持主体内容，复刻参考图的视觉语言。",
    prompt: "保持主体身份、轮廓和关键内容不变，只借鉴风格参考图的构图、配色、光线、材质表现与视觉氛围。不要复制参考图中的人物、品牌、文字或独特标识。",
    aspectRatio: "1:1",
    thumb: "style-transfer",
    preview: "/template-previews/style-transfer.jpg",
    slots: [
      { id: "subject", label: "主体图", description: "最终图片必须保留的主体", required: true },
      { id: "style", label: "风格参考", description: "用于参考构图、颜色和光线", required: true },
    ],
    builtIn: true,
  },
  {
    id: "scene-plate",
    name: "空场景图",
    category: "通用与自建",
    description: "只出环境不出主体：门店、居家、户外、台面四组场景点选即用，产出直接存进场景库当参考。",
    prompt: "生成一张真实的空场景参考图。画面里不出现任何人物、模特、宠物，也不摆放需要被展示的商品主体——这张图只交代环境本身。重点表现空间结构、陈设布置、材质质感、主光方向与色温，前中后景要有清晰的纵深层次，画面中部留出一块干净的空位，供后续把人或货放进来。真实摄影质感，透视自然，不做鱼眼与广角畸变。画面中不出现文字、水印、可辨认的品牌标识、店招、价格牌与车牌。只输出一张图。",
    aspectRatio: "3:4",
    thumb: "storefront",
    producesAsset: "scenes",
    slots: [
      { id: "style", label: "场景参考", description: "可选，用来定环境风格与色调；不传就完全按下面选的场景生成", required: false },
    ],
    scenePresets: [
      { id: "plate-boutique", label: "轻奢买手店", group: "门店室内", prompt: "轻奢买手店室内，浅木色地板与米白墙面，黑色细金属衣架沿墙陈列，射灯从顶部打下形成明确的光斑，画面中部留出一块空地。" },
      { id: "plate-rack-wall", label: "衣架墙", group: "门店室内", prompt: "服装店内的整面衣架墙，黑白棕色调，后方是大面积镜面墙延伸出空间感，暖白灯光均匀，地面干净无杂物。" },
      { id: "plate-cafe", label: "咖啡馆角落", group: "门店室内", prompt: "咖啡馆靠窗的角落，木质桌椅与藤编灯罩，窗外是散射的日光，桌面空着，空气里有淡淡的光尘感。" },
      { id: "plate-bookstore", label: "复古书店", group: "门店室内", prompt: "复古书店的两排书架之间，暖黄灯光照亮书脊，地面是深色木地板，过道空无一人。" },
      { id: "plate-bedroom", label: "居家卧室", group: "居家室内", prompt: "简约居家卧室，米白墙面与浅木地板，床与床头柜靠墙，暖色台灯亮着，窗帘半掩透进柔和自然光，房间中央空着。" },
      { id: "plate-living", label: "客厅沙发区", group: "居家室内", prompt: "居家客厅，布艺沙发配浅色地毯与绿植，落地窗透进午后斜射的自然光，茶几空着，色调温暖干净。" },
      { id: "plate-french", label: "法式墙角", group: "居家室内", prompt: "法式风格室内墙角，米白色素净墙面配石膏线，复古花瓶插着干花，柔和暖光从侧面打来，地面是人字拼木地板。" },
      { id: "plate-window", label: "雨天窗边", group: "居家室内", prompt: "室内窗边，大面积玻璃窗上布满雨滴，窗外是虚化的雨天街道，室内光偏冷，大理石窗台空着。" },
      { id: "plate-street", label: "春日绿意街道", group: "户外街景", prompt: "城市街道，两侧绿树与浅色围墙，阳光明媚的春日暖调光线，人行道干净，画面里没有行人与车辆。" },
      { id: "plate-oldstreet", label: "老街青石板", group: "户外街景", prompt: "青石板铺就的老街，两侧是复古店铺的木质门面与橱窗，光线偏暖，街上空无一人。" },
      { id: "plate-snow", label: "冬日雪景", group: "户外街景", prompt: "冬日雪后的户外空地，树木与灌木覆着白雪，空中飘着细雪，光线清冷偏蓝，雪地平整无脚印。" },
      { id: "plate-night", label: "夜晚街道", group: "户外街景", prompt: "夜晚的城市街道，商铺灯光与路灯在湿润地面上拉出光斑与倒影，背景虚化，画面安静没有行人。" },
      { id: "plate-marble", label: "大理石台面", group: "桌面台面", prompt: "浅灰白大理石台面俯视，侧上方柔和窗光在台面上留下淡淡影子，台面空着，背景是虚化的浅色墙面。" },
      { id: "plate-wood", label: "原木桌面", group: "桌面台面", prompt: "原木纹理桌面，暖色顶光，桌角有一支绿植入画，桌面主体区域空着，色调温暖。" },
      { id: "plate-linen", label: "亚麻布面", group: "桌面台面", prompt: "米色亚麻布铺就的平面，布面有自然的褶皱与织纹，柔和的散射光，画面干净只有布本身。" },
      { id: "plate-studio", label: "纯色影棚", group: "桌面台面", prompt: "影棚内的无缝背景纸，浅灰色渐变，地面与背景连成一体，柔光箱从左前方打光，画面里只有光影没有任何物件。" },
    ],
    builtIn: true,
  },
];
