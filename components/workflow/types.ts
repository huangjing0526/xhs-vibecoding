/** 工作台内跨组件传递的提示消息。各面板通过 onNotice 上报，由外层统一渲染 toast。 */
export type NoticeType = "success" | "error" | "info";

export interface Notice {
  type: NoticeType;
  message: string;
}
