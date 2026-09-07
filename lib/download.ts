/**
 * 浏览器端「存到本地」的唯一实现。
 *
 * 之前封面、配图各写了一份一模一样的建 `<a download>` 再 click，发布包又要第三份——
 * 三份分头改的话，将来碰上某个浏览器的下载怪癖就得记着改三处。各领域仍保留自己的
 * 语义化函数名（`downloadCover` / `downloadImageAsset`），但都落到这里。
 */
export function downloadFile(source: string | Blob, filename: string): void {
  // Blob 要先换成对象 URL，用完立刻回收；dataUrl 本身就能直接当 href
  const isBlob = source instanceof Blob;
  const href = isBlob ? URL.createObjectURL(source) : source;
  const link = document.createElement("a");
  link.download = filename;
  link.href = href;
  link.click();
  if (isBlob) URL.revokeObjectURL(href);
}
