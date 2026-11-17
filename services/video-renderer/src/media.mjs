/**
 * 本机媒体处理：把前端传来的 data URL 落盘、把多段视频拼成一条。
 *
 * 拼接用 ffmpeg 而不是 Remotion：数字人分段出来的片段规格完全一致，直接流拷贝
 * 几秒就完事，重新编码一遍纯属浪费（也会掉画质）。
 */

import { execFile } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 把远端视频落盘。两家的结果 URL 都有有效期（硅基流动只有 10 分钟），
 * 一律一拿到就存本地再用，所以这个函数放在通用层而不是某一家的适配里。
 */
export async function downloadTo(url, outPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载生成结果失败（HTTP ${response.status}）：${url}`);
  }
  await writeFile(outPath, Buffer.from(await response.arrayBuffer()));
  return outPath;
}

const DATA_URL_PATTERN = /^data:([^;,]+)(;base64)?,(.*)$/s;

const EXT_BY_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/bmp": "bmp",
};

function run(bin, args, { timeoutMs = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        if (error.code === "ENOENT") {
          reject(new Error(`未找到命令 ${bin}，请先安装：brew install ${bin}`));
          return;
        }
        reject(new Error(`${bin} 执行失败：${stderr || error.message}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

/**
 * 把 data URL 写成本地文件，返回真实路径。
 * 百炼只认 JPG/JPEG/PNG/BMP/WEBP，这里顺手把不支持的格式挡在调用云 API 之前。
 */
export async function writeDataUrl(dataUrl, dir, baseName) {
  const match = DATA_URL_PATTERN.exec(String(dataUrl || ""));
  if (!match) throw new Error("图片格式不对，请重新选择（需要是 data URL）");

  const [, mime, isBase64, payload] = match;
  const ext = EXT_BY_MIME[mime.toLowerCase()];
  if (!ext) {
    throw new Error(`不支持的图片格式 ${mime}，请用 JPG / PNG / WEBP / BMP`);
  }

  const buffer = isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload));
  const filePath = path.join(dir, `${baseName}.${ext}`);
  await writeFile(filePath, buffer);
  return { filePath, fileName: `${baseName}.${ext}`, byteLength: buffer.byteLength };
}

/**
 * 按顺序拼接多个 mp3。
 *
 * 混合剪辑要的是一条连续音轨：开场那段既要喂给数字人生成口型，又要和后半段接成整条，
 * 所以只能分别合成再拼——不能整段合成后切，那样切点会落在字中间。
 * edge-tts 输出参数一致，直接流拷贝即可。
 */
export async function concatAudio(inputPaths, outPath, workDir) {
  if (inputPaths.length === 0) throw new Error("没有可拼接的音频");
  if (inputPaths.length === 1) return inputPaths[0];
  return concatWithDemuxer(inputPaths, outPath, workDir);
}

/**
 * 按顺序拼接多个 mp4。单个片段时直接返回它本身，不白跑一次 ffmpeg。
 */
export async function concatVideos(inputPaths, outPath, workDir) {
  if (inputPaths.length === 0) throw new Error("没有可拼接的视频片段");
  if (inputPaths.length === 1) return inputPaths[0];
  return concatWithDemuxer(inputPaths, outPath, workDir);
}

/** 音视频共用的 concat demuxer 调用：输入编码参数一致时流拷贝，不重新编码。 */
async function concatWithDemuxer(inputPaths, outPath, workDir) {
  // concat demuxer 把清单里的相对路径按「清单文件所在目录」解析，不是按 CWD——
  // 一律转成绝对路径，免得调用方传相对路径时莫名其妙找不到文件。单引号要转义。
  const listPath = path.join(workDir, `${path.parse(outPath).name}-concat.txt`);
  const list = inputPaths
    .map((item) => `file '${path.resolve(item).replace(/'/g, "'\\''")}'`)
    .join("\n");
  await writeFile(listPath, list);

  try {
    await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath]);
  } finally {
    // 清单只是给 ffmpeg 的一次性输入，留着会在 out/ 和 audio/ 里越堆越多
    await rm(listPath, { force: true });
  }
  return outPath;
}
