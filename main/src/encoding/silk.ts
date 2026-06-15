import ffmpeg from 'fluent-ffmpeg';
import { file } from 'tmp-promise';
import silk from 'silk-sdk';
import fsP from 'fs/promises';

const conventOggToPcm = (oggPath: string, tmpFilePath: string): Promise<void> => {
  return new Promise(resolve => {
    ffmpeg(oggPath)
      .outputFormat('s16le')
      .outputOptions([
        '-ar', '24000',
        '-ac', '1',
        '-acodec', 'pcm_s16le',
      ])
      .on('end', async () => {
        resolve();
      }).save(tmpFilePath);
  });
};

const conventPcmToOgg = (pcmPath: string, savePath: string): Promise<void> => {
  return new Promise(resolve => {
    ffmpeg(pcmPath).inputOption([
      '-f', 's16le',
      '-ar', '24000',
      '-ac', '1',
    ])
      .outputFormat('ogg')
      .on('end', async () => {
        resolve();
      }).save(savePath);
  });
};

export default {
  async encode(oggPath: string): Promise<Buffer> {
    const { path, cleanup } = await file();
    await conventOggToPcm(oggPath, path);
    const bufSilk = silk.encode(path, {
      tencent: true,
    });
    await cleanup();
    return bufSilk;
  },

  async decode(buf: Buffer, outputPath: string): Promise<void> {
    // NapCat 下载的语音可能是 AMR 格式，检测文件头以区分
    const header = buf.subarray(0, 10).toString();
    if (header.startsWith('#!AMR')) {
      // AMR 格式：直接用 ffmpeg 转码为 OGG
      const { path, cleanup } = await file();
      await fsP.writeFile(path, buf);
      await new Promise<void>((resolve, reject) => {
        ffmpeg(path)
          .outputFormat('ogg')
          .outputOptions(['-ar', '24000', '-ac', '1'])
          .on('end', () => resolve())
          .on('error', reject)
          .save(outputPath);
      });
      await cleanup();
    } else {
      // SILK 格式（原有逻辑）
      const bufPcm = silk.decode(buf);
      const { path, cleanup } = await file();
      await fsP.writeFile(path, bufPcm);
      await conventPcmToOgg(path, outputPath);
      cleanup();
    }
  },

  conventOggToPcm16000: (oggPath: string, tmpFilePath: string): Promise<void> => {
    return new Promise(resolve => {
      ffmpeg(oggPath)
        .outputFormat('s16le')
        .outputOptions([
          '-ar', '16000',
          '-ac', '1',
          '-acodec', 'pcm_s16le',
        ])
        .on('end', async () => {
          resolve();
        }).save(tmpFilePath);
    });
  },
};
