// 爆款元素诊断工具

export interface ViralDiagnosis {
  dimensions: ViralDimension[];
  passCount: number;
  totalCount: number;
}

export interface ViralDimension {
  key: string;
  label: string;
  pass: boolean;
  tip: string;
  example: string;
}

export function diagnoseViralElements(
  title: string,
  content: string,
  _tags: string[]
): ViralDiagnosis {
  const fullText = title + " " + content;

  const dimensions: ViralDimension[] = [
    {
      key: "emotion",
      label: "情绪钩子",
      pass: /救命|崩溃|感动|惊了|绝了|笑死|哭了|太香|爱了|心动|破防|泪目|感动|哇|啊啊/.test(fullText),
      tip: "加入情绪词，让读者感同身受",
      example: '如「救命这也太好用了」「直接崩溃了哈哈」',
    },
    {
      key: "data",
      label: "数据支撑",
      pass: /\d+[%％天分钟小时元块张个次步]|第\d+|Day\s*\d+|\d+倍|\d+步/.test(fullText),
      tip: "加入具体数字，增加可信度",
      example: '如「用了3周」「省了2小时」「第5次打卡」',
    },
    {
      key: "audience",
      label: "人群定位",
      pass: /打工人|姐妹|小白|程序员|宝妈|学生|社畜|上班族|女生|男生|职场人|新手|萌新|同学/.test(fullText),
      tip: "明确目标读者，提升代入感",
      example: '如「打工人必看」「学生党福利」「敏感肌姐妹」',
    },
    {
      key: "actionable",
      label: "可执行性",
      pass: /教你|试试|建议|推荐|方法|步骤|技巧|攻略|秘诀|怎么|如何|可以|直接|分享/.test(fullText),
      tip: "让读者知道读完能做什么",
      example: '如「教你3步搞定」「推荐这样做」「直接抄作业」',
    },
    {
      key: "interaction",
      label: "互动引导",
      pass: /你呢|吗\？|有没有|评论|点赞|关注|收藏|姐妹们|大家|一起|来聊|求推荐|有同感/.test(content.slice(-100)),
      tip: "末尾加互动句，引导评论和点赞",
      example: '如「你们有同感吗？」「评论区聊聊～」「点赞求教程」',
    },
  ];

  const passCount = dimensions.filter((d) => d.pass).length;

  return { dimensions, passCount, totalCount: dimensions.length };
}
