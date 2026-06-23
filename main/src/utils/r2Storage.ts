import fs from 'fs';
import fsP from 'fs/promises';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import env from '../models/env';

type R2Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
};

let cachedConfig: R2Config | null | undefined;
let cachedClient: S3Client | undefined;

const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, '');

const normalizePublicUrl = (url: string) => url.replace(/\/+$/, '');

const getConfig = () => {
  if (cachedConfig !== undefined) return cachedConfig;

  const hasAnyConfig = [
    env.R2_ENDPOINT,
    env.R2_BUCKET,
    env.R2_ACCESS_KEY_ID,
    env.R2_SECRET_ACCESS_KEY,
    env.R2_PUBLIC_URL,
  ].some(Boolean);
  if (!hasAnyConfig) {
    cachedConfig = null;
    return cachedConfig;
  }

  if (!env.R2_ENDPOINT || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_PUBLIC_URL) {
    throw new Error('R2 配置不完整，需要 R2_ENDPOINT、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY、R2_PUBLIC_URL');
  }

  const endpointUrl = new URL(env.R2_ENDPOINT);
  const endpointBucket = trimSlashes(endpointUrl.pathname).split('/').filter(Boolean)[0];
  endpointUrl.pathname = '';
  endpointUrl.search = '';
  endpointUrl.hash = '';

  const bucket = env.R2_BUCKET || endpointBucket;
  if (!bucket) {
    throw new Error('R2 配置不完整，需要 R2_BUCKET，或在 R2_ENDPOINT 末尾带 bucket 路径');
  }

  cachedConfig = {
    endpoint: endpointUrl.toString().replace(/\/+$/, ''),
    bucket,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    publicUrl: normalizePublicUrl(env.R2_PUBLIC_URL),
  };
  return cachedConfig;
};

const getClient = () => {
  const config = getConfig();
  if (!config) return undefined;
  if (!cachedClient) {
    cachedClient = new S3Client({
      endpoint: config.endpoint,
      region: 'auto',
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return cachedClient;
};

export const isR2StorageEnabled = () => Boolean(getConfig());

export const buildR2MediaKey = (uuid: string, filename: string) =>
  `forward-multiple/${uuid}/${filename}`;

export const getR2PublicUrl = (key: string) => {
  const config = getConfig();
  if (!config) throw new Error('R2 未配置');
  return `${config.publicUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
};

export const uploadBufferToR2 = async (key: string, body: Buffer, contentType: string) => {
  const config = getConfig();
  const client = getClient();
  if (!config || !client) throw new Error('R2 未配置');
  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    ContentLength: body.byteLength,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return getR2PublicUrl(key);
};

export const uploadFileToR2 = async (key: string, filePath: string, contentType: string) => {
  const config = getConfig();
  const client = getClient();
  if (!config || !client) throw new Error('R2 未配置');
  const stat = await fsP.stat(filePath);
  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: fs.createReadStream(filePath),
    ContentType: contentType,
    ContentLength: stat.size,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return getR2PublicUrl(key);
};
