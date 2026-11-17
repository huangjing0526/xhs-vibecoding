/**
 * 用户可自行修复的失败（没装依赖、配置缺失、输入格式不对），而非服务故障。
 *
 * 放在 `lib/` 而不是 `app/api/**`：抛它的是 lib 层（飞书配置校验、本地服务调用），
 * 让 lib 反向 import app 的工具是错误的依赖方向。
 * `apiError()` 见到它会回 400，路由不必写 instanceof 分支。
 */
export class UserFacingError extends Error {}
