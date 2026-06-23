import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import fsP from 'fs/promises';
import path from 'path';
import { file as createTempFile, FileResult } from 'tmp-promise';
import { CustomFile } from 'telegram/client/uploads';
import { Api } from 'telegram';
import { fetchFile } from '../utils/urls';
import env from '../models/env';
import { fileTypeFromFile } from 'file-type';
import sharp from 'sharp';

type VideoForwardMedia = {
  file: CustomFile;
  attributes: Api.TypeDocumentAttribute[];
  thumb?: string;
  mimeType: string;
  tempFiles: FileResult[];
};

type VideoMetadata = {
  width: number;
  height: number;
  duration: number;
};

const createCacheTempFile = async (options: Parameters<typeof createTempFile>[0] = {}) => {
  await fsP.mkdir(env.CACHE_DIR, { recursive: true });
  return createTempFile({
    tmpdir: env.CACHE_DIR,
    ...options,
  });
};

if (env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(env.FFMPEG_PATH);
}
if (env.FFPROBE_PATH) {
  ffmpeg.setFfprobePath(env.FFPROBE_PATH);
}

export const createVideoForwardMedia = async (sourceUrlOrPath: string): Promise<VideoForwardMedia> => {
  const tempFiles: FileResult[] = [];
  try {
    const sourcePath = await ensureLocalVideo(sourceUrlOrPath, tempFiles);
    const metadata = await probeVideo(sourcePath);
    const thumb = await createVideoThumb(sourcePath, tempFiles).catch(() => undefined);
    const stat = await fsP.stat(sourcePath);
    const fileType = await fileTypeFromFile(sourcePath).catch(() => undefined);
    const ext = fileType?.ext || getPathExt(sourcePath).replace(/^\./, '') || 'mp4';
    const file = new CustomFile(`video.${ext}`, stat.size, sourcePath);

    return {
      file,
      attributes: [
        new Api.DocumentAttributeVideo({
          duration: metadata.duration,
          w: metadata.width,
          h: metadata.height,
          supportsStreaming: true,
        }),
        new Api.DocumentAttributeFilename({
          fileName: file.name,
        }),
      ],
      thumb,
      mimeType: fileType?.mime || 'video/mp4',
      tempFiles,
    };
  }
  catch (e) {
    await Promise.allSettled(tempFiles.map(item => item.cleanup()));
    throw e;
  }
};

const ensureLocalVideo = async (sourceUrlOrPath: string, tempFiles: FileResult[]) => {
  const source = sourceUrlOrPath.replace(/^file:\/\//, '');
  if (/^https?:\/\//i.test(source)) {
    const temp = await createCacheTempFile({ postfix: getPathExt(source) || '.mp4' });
    tempFiles.push(temp);
    await fsP.writeFile(temp.path, await fetchFile(source));
    return temp.path;
  }
  if (path.isAbsolute(source) && fs.existsSync(source)) {
    return source;
  }
  return source;
};

const probeVideo = (sourcePath: string) => new Promise<VideoMetadata>((resolve, reject) => {
  ffmpeg.ffprobe(sourcePath, (error, data) => {
    if (error) {
      reject(error);
      return;
    }
    const stream = data.streams.find(item => item.codec_type === 'video');
    if (!stream?.width || !stream?.height) {
      reject(new Error('视频宽高为空'));
      return;
    }
    const { width, height } = getDisplaySize(stream);
    resolve({
      width,
      height,
      duration: Math.max(0, Math.round(Number(stream.duration || data.format.duration || 0))),
    });
  });
});

const getDisplaySize = (stream: {
  width?: number;
  height?: number;
  sample_aspect_ratio?: string;
  tags?: Record<string, string>;
  side_data_list?: Array<Record<string, unknown>>;
}) => {
  let width = Number(stream.width);
  let height = Number(stream.height);
  const sampleAspectRatio = parseRatio(stream.sample_aspect_ratio);
  if (sampleAspectRatio) {
    width = Math.round(width * sampleAspectRatio);
  }
  const rotation = getRotation(stream);
  if (Math.abs(rotation) % 180 === 90) {
    [width, height] = [height, width];
  }
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
};

const getRotation = (stream: { tags?: Record<string, string>; side_data_list?: Array<Record<string, unknown>> }) => {
  const tagRotation = Number(stream.tags?.rotate);
  if (!Number.isNaN(tagRotation)) {
    return tagRotation;
  }
  for (const item of stream.side_data_list || []) {
    const rotation = Number(item.rotation);
    if (!Number.isNaN(rotation)) {
      return rotation;
    }
  }
  return 0;
};

const parseRatio = (value?: string) => {
  const match = value?.match(/^(\d+):(\d+)$/);
  if (!match)
    return 0;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!numerator || !denominator)
    return 0;
  return numerator / denominator;
};

const createVideoThumb = async (sourcePath: string, tempFiles: FileResult[]) => {
  const temp = await createCacheTempFile({ postfix: '.jpg' });
  tempFiles.push(temp);
  await fsP.unlink(temp.path).catch(() => undefined);
  await new Promise<void>((resolve, reject) => {
    ffmpeg(sourcePath)
      .frames(1)
      .outputOptions([
        '-vf', 'scale=320:320:force_original_aspect_ratio=decrease',
        '-q:v', '8',
      ])
      .output(temp.path)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
  const optimized = await sharp(temp.path)
    .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 68, mozjpeg: true })
    .toBuffer();
  await fsP.writeFile(temp.path, optimized);
  const stat = await fsP.stat(temp.path);
  return stat.size ? temp.path : undefined;
};

const getPathExt = (value: string) => {
  try {
    return path.extname(new URL(value).pathname);
  }
  catch {
    return path.extname(value);
  }
};
