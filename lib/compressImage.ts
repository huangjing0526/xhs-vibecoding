/**
 * 上传前在浏览器里把图片压到合理尺寸。
 *
 * 手机直出照片动辄 5MB，转成 base64 还要再涨三分之一，一次传几张就会把请求体撑爆；
 * 生视频模型也不吃超大图。统一压到最长边 1280、JPEG 0.85，画质对短视频足够。
 */

/** 百炼 wan2.2-s2v 要求边长在 400-7000 像素之间，太小的图直接在客户端拦下来。 */
const MIN_EDGE = 400;

export interface CompressedImage {
  dataUrl: string;
  width: number;
  height: number;
}

export async function compressImageFile(
  file: File,
  { maxEdge = 1280, quality = 0.85 }: { maxEdge?: number; quality?: number } = {}
): Promise<CompressedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`「${file.name}」不是图片，请选择 JPG / PNG / WEBP`);
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  if (Math.min(width, height) < MIN_EDGE) {
    bitmap.close();
    throw new Error(`「${file.name}」太小了（${bitmap.width}×${bitmap.height}），最短边需要 ${MIN_EDGE} 像素以上`);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("浏览器不支持 canvas，无法处理图片");
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return { dataUrl: canvas.toDataURL("image/jpeg", quality), width, height };
}
