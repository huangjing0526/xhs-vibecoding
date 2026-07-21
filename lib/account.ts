/**
 * 账号级配置。
 *
 * 这些是「这个号是谁、写给谁」的事实，横跨所有发布目标，不随目标而变——
 * 因此它是账号级配置，而非目标级配置，不进 lib/targets.ts 的目标档案。
 * 各 prompt 从这里读同一份，避免受众描述与账号定位被复制到多处后互相漂移。
 */

/** 目标读者。是各处 prompt 里唯一真正重复的原子片段。 */
export const ACCOUNT_AUDIENCE = "产品经理、独立开发者、AI Coding 新手";

/** 账号定位一句话。原先在 xhsWorkflow / coverWorkflow 各写一份。 */
export const ACCOUNT_POSITIONING = `给${ACCOUNT_AUDIENCE}看的真实 AI 编程实战复盘。`;
