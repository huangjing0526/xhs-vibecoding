import type { ImageFactoryTemplate } from "../types";

/** 服装线的上游：先攒出一位身份固定的虚拟模特，再拿它去换装、拍场景。 */
export const MODEL_TEMPLATES: ImageFactoryTemplate[] = [
  {
    id: "model-asset",
    name: "模特资产图",
    category: "模特资产",
    description: "一位模特的整套身份资产：九宫格头部角度与表情、定妆主图、全身三视图。更稳的跑法：先只出定妆主图，入库后拿它当模特参考再跑其余视角。",
    prompt: "生成一张写实的人像模特资产图，用途是作为后续换装与场景合成的身份基准，因此身份一致性优先于画面美感。提供模特参考图或身份描述时，严格保持五官比例、脸型与下颌线、发型发色与发缝位置、肤色与年龄感、身材比例完全一致，包括参考图里嘴角高低这类轻微的自然不对称——这是同一个人，不得换脸、不得美化五官、不得改变脸宽与下巴长度。没有提供参考图也没有选人设时，默认生成一位二十多岁的亚洲女性模特，五官自然协调。固定造型：奶油色或浅灰的素色针织上衣与同色系直筒长裤，无图案、无 logo、无首饰、无帽子墨镜等遮挡身份的配饰。布光要有方向和体积：主光是一只大柔光箱，位于相机轴一侧约 40 度、高于眼位约 20 度，在鼻侧留下一小块自然的 loop 阴影，颧骨下方有柔和的明暗过渡；对侧用白色反光板补光，光比约 3:1，暗部只是变暗、不死黑；再补一支弱的发丝轮廓光，把头发边缘从背景里分出来。眼睛里必须有清晰的柔光箱眼神光。暖白无缝影棚背景，背景比面部暗约半档并带自然的光线衰减，不要和肤色糊成一片。绝对不要正面平光、零阴影的证件照式布光，也不要 HDR 式的全局提亮与褪色感。肤色要有血色：皮肤有次表面散射的通透感，脸颊、鼻头、耳廓、眼睑与嘴唇比其余部位略偏红润，唇色是自然的血色而非打了粉底的灰调；整体肤色中性偏暖，色温约 5300K，不发灰、不发青、不发蜡。真实照片质感：保留毛孔、绒毛与轻微肤色起伏，皮肤哑光到缎光，T 区与颧骨允许一点自然的皮肤反光，只是不要连成一片死白；不磨皮、不美颜、不做插画或 CG 渲染。85mm 定焦、f/2.8 到 f/4 的人像拍法，对焦在眼睛，背景轻微虚化。画面中不出现文字、水印、品牌标识。一次只输出当前这一个视角的一张图，绝对不要把多个角度拼进同一张图。",
    aspectRatio: "3:4",
    thumb: "model-asset",
    preview: "/template-previews/model-asset.jpg",
    producesAsset: "models",
    slots: [
      { id: "model", label: "模特参考", description: "可选，传了就锁定这张脸；不传按文字描述新生成一位", required: false },
    ],
    // 规格来自实拍档案的做法：九宫格头部锁身份，定妆主图当门面，全身三视图供换装用。
    // 头肩与全身都走 9:16 竖幅——这套资产是拿去铺抖音的，定妆主图留 3:4 当图文门面。
    // 各视角带自己的画幅，不迁就模板那个统一比例。
    views: [
      { id: "key-visual", group: "定妆主图", label: "定妆主图", hint: "腰部以上的半身定妆照，身体略侧、脸转向镜头，是这位模特对外的门面图。这一张的光要比其余角度更讲究：主光的 loop 阴影和轮廓光都要看得出来，眼神有焦点、嘴角有极轻微的放松上扬，不是证件照式的面无表情；脸颊有明显血色，背景比人物暗，人从背景里立出来。", aspectRatio: "3:4", preview: "/template-previews/model-asset__key-visual.jpg" },
      { id: "body-front", group: "全身三视图", label: "正面全身", hint: "正面平视全身站姿，双臂自然垂放，头到脚完整入画，展示整体身材比例。", aspectRatio: "9:16", preview: "/template-previews/model-asset__body-front.jpg" },
      { id: "body-side", group: "全身三视图", label: "侧面全身", hint: "身体侧转 90 度的全身站姿，展示侧面轮廓与身形曲线。", aspectRatio: "9:16", preview: "/template-previews/model-asset__body-side.jpg" },
      { id: "body-back", group: "全身三视图", label: "背面全身", hint: "背面全身站姿，展示背影轮廓与发型的背面形态。", aspectRatio: "9:16", preview: "/template-previews/model-asset__body-back.jpg" },
      { id: "head-front", group: "头部九宫格", label: "正面头肩", hint: "严格正面头肩近景，视线看向镜头，表情自然放松，作为锁定身份的主锚点。", aspectRatio: "9:16", preview: "/template-previews/model-asset__head-front.jpg" },
      { id: "head-left-45", group: "头部九宫格", label: "左转 45°", hint: "头部向人物自身左侧转 45 度的头肩近景，视线跟随转向，五官仍清晰可读。", aspectRatio: "9:16", preview: "/template-previews/model-asset__head-left-45.jpg" },
      { id: "head-right-45", group: "头部九宫格", label: "右转 45°", hint: "头部向人物自身右侧转 45 度的头肩近景，与左侧 45 度严格对称同一张脸。", aspectRatio: "9:16", preview: "/template-previews/model-asset__head-right-45.jpg" },
      { id: "head-left-profile", group: "头部九宫格", label: "左正侧脸", hint: "向人物自身左侧转 90 度的正侧脸，展示鼻梁、唇形与下颌的侧面轮廓线。", aspectRatio: "9:16", preview: "/template-previews/model-asset__head-left-profile.jpg" },
      { id: "head-right-profile", group: "头部九宫格", label: "右正侧脸", hint: "向人物自身右侧转 90 度的正侧脸，与左侧脸保持同一套骨相。", aspectRatio: "9:16", preview: "/template-previews/model-asset__head-right-profile.jpg" },
      { id: "head-up", group: "头部九宫格", label: "微抬头", hint: "头部上抬约 15 度的头肩近景，展示下颌与颈部的连接关系。", aspectRatio: "9:16", preview: "/template-previews/model-asset__head-up.jpg" },
      { id: "head-down", group: "头部九宫格", label: "微低头", hint: "头部下压约 15 度的头肩近景，视线略向下，展示眼睑与额头的形态。", aspectRatio: "9:16", preview: "/template-previews/model-asset__head-down.jpg" },
      { id: "expression-smile", group: "头部九宫格", label: "柔和微笑", hint: "正面头肩近景的不露齿微笑，只改变嘴角、面颊与下眼睑，头部角度与光线保持不变。", aspectRatio: "9:16", preview: "/template-previews/model-asset__expression-smile.jpg" },
      { id: "expression-eyes-closed", group: "头部九宫格", label: "闭眼", hint: "正面头肩近景的自然闭眼，睫毛与眼睑形态清晰，其余一切保持不变。", aspectRatio: "9:16", preview: "/template-previews/model-asset__expression-eyes-closed.jpg" },
    ],
    scenePresets: [
      { id: "studio-warm-white", label: "暖白棚拍", prompt: "暖白色无缝影棚背景，侧 40 度大柔光箱主光配对侧反光板，光比约 3:1，鼻侧有柔和的 loop 阴影，眼中有眼神光，肤色温润有血色。" },
      { id: "studio-grey", label: "浅灰棚拍", prompt: "干净的浅灰色摄影棚背景，柔和的侧向主光加轻补光，面部有明暗过渡，另加一支发丝轮廓光把人物从背景里分离，无杂物无道具。" },
      { id: "studio-white", label: "纯白棚拍", prompt: "纯白色摄影棚背景，明亮通透的光线，背景干净适合后续抠图；即便阴影很轻，面部仍要有立体感与血色，不要把脸打成一片平光。" },
    ],
    // 人设包：一条写全气质长相 + 妆容 + 发型，互洽措辞不留自由组合；只描述人，不碰布光与服装
    stylePresets: [
      { id: "persona-cool", label: "清冷高级脸", prompt: "清冷高级脸：眼距略窄的内双或单眼皮，眼型平直微挑，颧骨与下颌线清晰利落，鼻梁直挺，薄唇，表情克制带疏离感；妆容是哑光淡妆，眉形平直偏淡，雾面豆沙唇色；黑色长直发中分，发丝服帖有光泽。" },
      { id: "persona-first-love", label: "邻家初恋感", prompt: "邻家初恋感：脸型圆润柔和，杏眼双眼皮，卧蚕明显，鼻头微圆，气质温软亲和；妆容是伪素颜，只有极淡的眼妆和水光感的浅粉唇；深棕色锁骨发配薄薄的空气刘海，发尾自然内扣。" },
      { id: "persona-urban", label: "都市干练", prompt: "都市干练：面部轮廓利落，眉形偏直有力，眼神笃定，鼻梁挺直，年龄感二十八到三十二岁；妆容是干净的轻熟通勤妆，哑光底妆配裸棕色唇；深色头发梳成利落的低马尾或低盘发，鬓角无碎发。" },
      { id: "persona-exotic", label: "浓颜混血感", prompt: "浓颜混血感：眼窝深邃，睫毛浓密，高鼻梁，唇形饱满立体，面部骨骼立体度高；妆容强调轮廓，眼尾晕染棕调眼影，唇色饱和；深棕色微卷长发，发量蓬松有空气感。" },
      { id: "persona-jp-mag", label: "日杂松弛感", prompt: "日杂松弛感：淡眉平眼，五官清淡耐看，鼻梁秀气，脸颊与鼻梁带少量自然雀斑；妆容近乎素颜，只压掉油光，涂润泽的浅色唇膏；深茶色自然微乱的齐肩发，随性不刻意。" },
    ],
    builtIn: true,
  },
  {
    id: "model-styled",
    name: "风格定妆图",
    category: "模特资产",
    description: "拿库里已定妆的模特锁死身份，只换妆造、影调与场景，出杂志硬照、胶片写真这类有风格的门面图。",
    prompt: "基于参考图中的模特生成一张有风格的写真照。严格保持参考图人物的五官比例、脸型与下颌线、肤色与身材完全一致，这是同一个人，不得换脸、不得美化骨相。允许按所选影调更换妆容、发型细节、服装与场景，但换完必须一眼认得出是同一个人。布光要有方向和体积，眼中有清晰的眼神光，肤色有血色、不发灰不发蜡。真实照片质感：保留毛孔与轻微肤色起伏，不磨皮、不美颜、不做插画或 CG 渲染。画面中不出现文字、水印、品牌标识。一次只输出一张图，不要把多个画面拼进同一张图。若提供了风格参考图，只学习它的影调、构图与妆造方向，不得复刻其中的人物长相或具体画面。",
    aspectRatio: "3:4",
    producesAsset: "models",
    slots: [
      { id: "model", label: "模特图", description: "已定妆的模特照，锁定人物身份", required: true },
      { id: "style", label: "风格参考", description: "可选，只学它的影调与妆造方向，不复刻画面", required: false },
    ],
    views: [
      { id: "styled-half", label: "半身正面", hint: "腰部以上半身，身体略侧、脸转向镜头，是这套风格的主图。", aspectRatio: "3:4" },
      { id: "styled-face", label: "面部特写", hint: "锁骨以上的面部特写，妆容与皮肤质感看得最清楚的一张。", aspectRatio: "3:4" },
      { id: "styled-full", label: "全身站姿", hint: "全身入画的站姿，姿态贴合所选影调的气质。", aspectRatio: "9:16" },
    ],
    // 影调直接复用场景预设机制：影调本来就是「画面」的事，单选也正好
    scenePresets: [
      { id: "tone-editorial", label: "杂志硬照", prompt: "时尚杂志内页硬照的棚拍影调：单灯硬光塑形，明暗对比强烈，深灰或纯色无缝背景，构图利落，整体高级克制。" },
      { id: "tone-film", label: "胶片写真", prompt: "胶片写真影调：柔和的自然光，画面带细腻胶片颗粒与轻微暖调偏色，高光温润、暗部松弛，像富士胶片拍出的人像。" },
      { id: "tone-street", label: "街拍抓拍", prompt: "都市街拍抓拍感：午后自然光下的城市街道，背景行人与街景虚化，姿态像被抓拍的瞬间，画面有轻微动感与生活气。" },
      { id: "tone-jp-mag", label: "日系日杂", prompt: "日系杂志影调：大面积窗边自然光，画面通透干净、带一点点过曝的清爽感，低饱和奶油色调，情绪松弛。" },
      { id: "tone-luxury", label: "高奢冷调", prompt: "高奢冷调大片：冷色调影棚光，金属灰或深色背景，光比大、阴影干净，表情淡漠，氛围昂贵克制。" },
      { id: "tone-hk", label: "复古港风", prompt: "复古港风影调：暖黄的钨丝灯光，浓郁的红绿撞色环境，胶片颗粒与轻微暗角，九十年代港片剧照的味道。" },
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
      { id: "model", label: "模特图", description: "已定妆的模特照，用于锁定人物身份与服装", required: true },
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
