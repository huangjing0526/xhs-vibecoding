/**
 * 最小 zip 打包（store 模式，不压缩）。
 *
 * 不装 jszip：这个模块被发布包直接引用，会随应用打进 Cloudflare Workers 产物；
 * 而要打包的只是 PNG 和一小段文本，PNG 本身已经压缩过，再 deflate 一遍近乎零收益。
 * 一个不压缩的打包器换掉一整个依赖，这笔账划算。
 *
 * 只实现发布包需要的那部分：store 模式、UTF-8 文件名、无目录项、无 zip64。
 * 单个文件或整包超过 4GB 会溢出 32 位字段——发布包是几张图，到不了那个量级。
 */

export interface ZipEntry {
  /** 包内文件名，可含 `/` 表示目录 */
  name: string;
  data: Uint8Array;
}

/** CRC-32 查找表，按需构造一次后常驻——每个文件都要算一遍，不能每次重建。 */
let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(data: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** zip 的时间戳是 DOS 格式：日期和时间各挤进 16 位，秒只有 2 秒精度。 */
function toDosDateTime(date: Date): { time: number; date: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f);
  const dosDate = (((date.getFullYear() - 1980) & 0x7f) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

class ByteWriter {
  private chunks: Uint8Array[] = [];
  private length = 0;

  get offset(): number {
    return this.length;
  }

  push(bytes: Uint8Array): void {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }

  /** 小端写入定长字段：zip 的所有数值字段都是小端。 */
  pushNumbers(fields: Array<{ value: number; bytes: 2 | 4 }>): void {
    const size = fields.reduce((sum, field) => sum + field.bytes, 0);
    const buffer = new Uint8Array(size);
    const view = new DataView(buffer.buffer);
    let cursor = 0;
    for (const field of fields) {
      if (field.bytes === 2) view.setUint16(cursor, field.value, true);
      else view.setUint32(cursor, field.value >>> 0, true);
      cursor += field.bytes;
    }
    this.push(buffer);
  }

  toBlob(type: string): Blob {
    // BlobPart 接受 ArrayBufferView，逐块交给 Blob 拼，避免先在内存里连成一整块
    return new Blob(this.chunks as BlobPart[], { type });
  }
}

/**
 * 把若干文件打成一个 zip。
 * 同名条目由调用方保证不重复——zip 允许重名，但解压行为依实现而定，不该赌。
 */
export function createZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const { time, date } = toDosDateTime(new Date());
  const writer = new ByteWriter();
  const central: Array<{ name: Uint8Array; crc: number; size: number; offset: number }> = [];

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const offset = writer.offset;

    // local file header：0x04034b50，版本 2.0，bit 11 置位声明文件名是 UTF-8，方法 0 = store
    writer.pushNumbers([
      { value: 0x04034b50, bytes: 4 },
      { value: 20, bytes: 2 },
      { value: 0x0800, bytes: 2 },
      { value: 0, bytes: 2 },
      { value: time, bytes: 2 },
      { value: date, bytes: 2 },
      { value: crc, bytes: 4 },
      { value: entry.data.length, bytes: 4 },
      { value: entry.data.length, bytes: 4 },
      { value: name.length, bytes: 2 },
      { value: 0, bytes: 2 },
    ]);
    writer.push(name);
    writer.push(entry.data);

    central.push({ name, crc, size: entry.data.length, offset });
  }

  const centralStart = writer.offset;
  for (const item of central) {
    // central directory header：0x02014b50，其余字段与 local header 对应
    writer.pushNumbers([
      { value: 0x02014b50, bytes: 4 },
      { value: 20, bytes: 2 },
      { value: 20, bytes: 2 },
      { value: 0x0800, bytes: 2 },
      { value: 0, bytes: 2 },
      { value: time, bytes: 2 },
      { value: date, bytes: 2 },
      { value: item.crc, bytes: 4 },
      { value: item.size, bytes: 4 },
      { value: item.size, bytes: 4 },
      { value: item.name.length, bytes: 2 },
      { value: 0, bytes: 2 },
      { value: 0, bytes: 2 },
      { value: 0, bytes: 2 },
      { value: 0, bytes: 2 },
      { value: 0, bytes: 4 },
      { value: item.offset, bytes: 4 },
    ]);
    writer.push(item.name);
  }

  const centralSize = writer.offset - centralStart;

  // end of central directory：0x06054b50
  writer.pushNumbers([
    { value: 0x06054b50, bytes: 4 },
    { value: 0, bytes: 2 },
    { value: 0, bytes: 2 },
    { value: central.length, bytes: 2 },
    { value: central.length, bytes: 2 },
    { value: centralSize, bytes: 4 },
    { value: centralStart, bytes: 4 },
    { value: 0, bytes: 2 },
  ]);

  return writer.toBlob("application/zip");
}

/**
 * 解析 `data:image/png;base64,...` 里的字节。
 * 只认 base64——喂进来的都是 `canvas.toDataURL()` 的产物，恒为 base64；
 * 其它形态一律抛错，不静默产出一个空文件让人下载到坏图。
 */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIndex = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || commaIndex < 0 || !dataUrl.slice(5, commaIndex).includes(";base64")) {
    throw new Error("不是 base64 data URL，无法打包");
  }

  const binary = atob(dataUrl.slice(commaIndex + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
