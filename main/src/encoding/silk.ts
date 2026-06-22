import ffmpeg from 'fluent-ffmpeg';
import { file } from 'tmp-promise';
import silk from 'silk-sdk';
import fsP from 'fs/promises';

const SILK_HEADER = Buffer.from('#!SILK');
const AMR_HEADER = Buffer.from('#!AMR');

const hasHeaderNearStart = (buffer: Buffer, header: Buffer) =>
  buffer.subarray(0, 16).indexOf(header) >= 0;

const isSilkBuffer = (buffer: Buffer) => hasHeaderNearStart(buffer, SILK_HEADER);

const isAmrBuffer = (buffer: Buffer) => hasHeaderNearStart(buffer, AMR_HEADER);

const applyOggVoiceOutput = (command: ffmpeg.FfmpegCommand) => {
  command
    .audioCodec('libopus')
    .audioFrequency(48000)
    .audioChannels(1)
    .outputFormat('ogg')
    .outputOptions([
      '-b:a', '32k',
      '-application', 'voip',
    ]);
};

const conventOggToPcm = (oggPath: string, tmpFilePath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    ffmpeg(oggPath)
      .outputFormat('s16le')
      .outputOptions([
        '-ar', '24000',
        '-ac', '1',
        '-acodec', 'pcm_s16le',
      ])
      .on('end', async () => {
        resolve();
      })
      .on('error', reject)
      .save(tmpFilePath);
  });
};

const conventPcmToOgg = (pcmPath: string, savePath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const command = ffmpeg(pcmPath).inputOption([
      '-f', 's16le',
      '-ar', '24000',
      '-ac', '1',
    ]);
    applyOggVoiceOutput(command);
    command
      .on('end', async () => {
        resolve();
      })
      .on('error', reject)
      .save(savePath);
  });
};

const convertAudioToOgg = (sourcePath: string, savePath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const command = ffmpeg(sourcePath);
    applyOggVoiceOutput(command);
    command
      .on('end', async () => {
        resolve();
      })
      .on('error', reject)
      .save(savePath);
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

  async decode(bufSilk: Buffer, outputPath: string): Promise<void> {
    const bufPcm = silk.decode(bufSilk);
    const { path, cleanup } = await file();
    try {
      await fsP.writeFile(path, bufPcm);
      await conventPcmToOgg(path, outputPath);
    }
    finally {
      await cleanup();
    }
  },

  async decodeVoice(buffer: Buffer, outputPath: string): Promise<void> {
    if (isAmrBuffer(buffer)) {
      const { path, cleanup } = await file({ postfix: '.amr' });
      try {
        await fsP.writeFile(path, buffer);
        await convertAudioToOgg(path, outputPath);
      }
      finally {
        await cleanup();
      }
      return;
    }

    if (isSilkBuffer(buffer)) {
      await this.decode(buffer, outputPath);
      return;
    }

    try {
      await this.decode(buffer, outputPath);
    }
    catch (silkError) {
      const { path, cleanup } = await file({ postfix: '.audio' });
      try {
        await fsP.writeFile(path, buffer);
        await convertAudioToOgg(path, outputPath);
      }
      catch {
        throw silkError;
      }
      finally {
        await cleanup();
      }
    }
  },

  conventOggToPcm16000: (oggPath: string, tmpFilePath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      ffmpeg(oggPath)
        .outputFormat('s16le')
        .outputOptions([
          '-ar', '16000',
          '-ac', '1',
          '-acodec', 'pcm_s16le',
        ])
        .on('end', async () => {
          resolve();
        })
        .on('error', reject)
        .save(tmpFilePath);
    });
  },
};
