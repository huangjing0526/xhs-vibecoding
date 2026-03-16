# 硅基流动配置指南 🚀

## 问题原因

你之前保存的配置是"自定义 API"，系统检测到的是 `custom` 而不是 `siliconflow`，导致连接失败。

## 解决方案（2 分钟搞定）

### 方法 1：清除旧配置（推荐）⭐

1. **打开浏览器开发者工具**
   - Windows/Linux: 按 `F12`
   - Mac: 按 `Cmd + Option + I`

2. **打开 Console 标签页**

3. **粘贴以下代码并回车**：
   ```javascript
   localStorage.removeItem('vibenote_api_config');
   alert('配置已清除！请刷新页面');
   ```

4. **刷新页面** (F5 或 Cmd+R)

5. **重新配置**：
   - 点击右上角"API 配置"
   - 选择"硅基流动"（第一个选项）
   - 输入你的 API Key
   - 点击"测试连接"
   - 保存并刷新

---

### 方法 2：使用界面清除（更简单）

1. **刷新浏览器**
2. **点击右上角"API 配置"按钮**
3. **点击左下角"清除配置"按钮**
4. **确认清除**
5. **选择"硅基流动"**
6. **输入 API Key**
7. **测试连接**
8. **保存并刷新**

---

## 验证配置正确

打开浏览器控制台（F12），在生成时应该看到：

```
[Client Config] Provider: siliconflow
[Provider] Using client config: siliconflow
[AI Provider] Using: siliconflow
[SiliconFlow] Using model: Qwen/Qwen2.5-7B-Instruct
```

如果看到 `custom` 而不是 `siliconflow`，说明配置还没清除干净。

---

## 硅基流动 API Key 获取

1. 访问：https://cloud.siliconflow.cn/account/ak
2. 登录账号
3. 创建新的 API Key
4. 复制密钥（格式：`sk-...`）

---

## 推荐模型

| 模型 | 说明 | 适用场景 |
|------|------|----------|
| **Qwen/Qwen2.5-7B-Instruct** | 性价比最高 ⭐ | 日常使用 |
| deepseek-ai/DeepSeek-V3 | 推理能力强 | 复杂任务 |
| Qwen/Qwen2.5-14B-Instruct | 平衡性能 | 高质量输出 |

---

## 常见问题

### Q: 为什么之前的"自定义"配置不能用？

A: 你之前配置的 Base URL 可能有问题（比如用了 http:// 而不是 https://），或者配置格式不对。使用专门的"硅基流动"选项会自动配置正确的 Base URL。

### Q: 清除配置会影响其他数据吗？

A: 不会，只清除 API 配置，人设、历史记录等其他数据不受影响。

### Q: 测试连接失败怎么办？

A: 检查：
1. API Key 是否正确（完整复制，无空格）
2. API Key 是否已启用
3. 账户余额是否充足
4. 网络是否正常

---

## 需要帮助？

如果还是有问题，请提供：
1. 浏览器控制台的完整错误信息
2. 使用的模型名称
3. 测试连接的结果截图
