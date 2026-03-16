# VibeNote - 你的爆款笔记 ✨

AI 一键生成小红书爆款笔记 - 封面图+文案+标签

## 功能特性

- 📝 **Markdown 输入** - 支持上传或编辑 Markdown 文档
- 🎨 **智能封面生成** - 3:4 小红书竖版封面，支持自定义
- 🤖 **AI 文案创作** - 自动生成爆款标题和正文
- 🏷️ **智能标签推荐** - 大流量+精准标签组合
- 👤 **人设定制** - 配置个人风格和口头禅
- ⏰ **发布时间建议** - 推荐最佳发布时段

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 AI API

#### 方式 1：界面配置（推荐）⭐

1. 启动项目后，点击右上角 **"API 配置"** 按钮
2. 选择你的 AI 服务商
3. 输入 API Key
4. 点击"测试连接"验证
5. 保存并刷新页面

#### 方式 2：环境变量配置

复制 `.env.example` 为 `.env` 并配置：

```bash
cp .env.example .env
```

**选项 1：硅基流动（国内推荐）🚀**

```env
SILICONFLOW_API_KEY=sk-xxx
SILICONFLOW_MODEL=Qwen/Qwen2.5-7B-Instruct
```

获取 API Key: https://cloud.siliconflow.cn/account/ak

- ✅ 国内访问稳定
- ✅ 价格便宜
- ✅ 响应速度快
- 支持 Qwen、DeepSeek 等模型

**选项 2：OpenAI**

```env
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=gpt-4o-mini
```

获取 API Key: https://platform.openai.com/

**选项 3：Anthropic Claude**

```env
ANTHROPIC_API_KEY=sk-ant-xxx
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

获取 API Key: https://console.anthropic.com/

**选项 4：自定义 API**

```env
CUSTOM_API_KEY=your_key
CUSTOM_API_BASE=https://api.example.com/v1
CUSTOM_MODEL=your-model-name
```

**注意**：优先级为 硅基流动 > OpenAI > Anthropic > Custom

### 3. 启动开发服务器

```bash
npm run dev
```

打开 http://localhost:3000

## 使用说明

### 基本流程

1. **输入内容** - 上传或编辑 Markdown 笔记
2. **编辑封面** - 自定义标题、颜色、背景图
3. **配置人设** - 设置个人风格（可选）
4. **生成内容** - 点击"一键生成"按钮
5. **预览导出** - 下载封面图，复制文案

### Markdown 格式建议

```markdown
---
title: 你的标题
mood: excited
---

# 主标题

你的笔记内容...

## 要点

- 要点1
- 要点2
```

支持的 mood：
- `excited` - 兴奋
- `frustrated` - 沮丧
- `achievement` - 成就
- `curiosity` - 好奇
- `struggle` - 挣扎

## 技术栈

- **框架**: Next.js 14 + React 18
- **样式**: Tailwind CSS
- **AI SDK**: OpenAI / Anthropic
- **图像处理**: Satori + Resvg
- **Markdown**: gray-matter + remark

## 项目结构

```
├── app/
│   ├── api/
│   │   ├── cover/      # 封面生成 API
│   │   └── generate/   # AI 文案生成 API
│   └── page.tsx        # 主页面
├── components/         # React 组件
├── lib/               # 工具函数
│   ├── cover.ts       # 封面生成逻辑
│   ├── markdown.ts    # Markdown 解析
│   └── personalization.ts  # 人设管理
└── public/            # 静态资源
```

## 开发

```bash
# 开发模式
npm run dev

# 构建生产版本
npm run build

# 启动生产服务器
npm start
```

## 常见问题

### Q: 未配置 API Key 能用吗？

A: 可以！未配置时会返回模拟数据，但建议配置真实 API 以获得最佳效果。

### Q: 支持哪些 AI 模型？

A:
- OpenAI: gpt-4o, gpt-4o-mini, gpt-4-turbo 等
- Anthropic: claude-sonnet-4, claude-opus-4 等
- 兼容 OpenAI 格式的任何 API

### Q: 提示"API 连接失败"怎么办？

A: 常见原因和解决方案：
1. **自定义 API**: Base URL 必须以 `https://` 开头，不能用 `http://`
2. **OpenAI**: 确认 API Key 格式正确（`sk-...`）
3. **网络问题**: 检查是否需要代理
4. **API Key 无效**: 重新生成 API Key
5. 使用"测试连接"功能检测配置

### Q: 封面图片如何上传？

A: 点击"背景图片"区域，选择本地图片即可。支持 JPG/PNG 格式。

### Q: 如何保存人设配置？

A: 人设配置自动保存到浏览器 localStorage，下次打开自动加载。

### Q: 配置了 API 但还是返回模拟数据？

A: 请确认：
1. 保存配置后刷新了页面
2. API Key 已正确输入
3. 使用"测试连接"验证配置
4. 查看浏览器控制台是否有错误信息

## License

MIT

---

**VibeNote** - 让你的笔记成为爆款 🚀✨
