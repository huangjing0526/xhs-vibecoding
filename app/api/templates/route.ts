import { apiError, apiOk } from "../feishu/_utils";
import { TEMPLATE_PACKS } from "@/lib/templates/registry";

/** 模板画廊的数据源。注册表是纯静态配置，整份返回，前端不必逐个模板再问一次。 */
export async function GET() {
  try {
    return apiOk({ packs: TEMPLATE_PACKS }, "模板列表获取成功");
  } catch (error) {
    return apiError(error, "templates.list", "模板列表获取失败");
  }
}
