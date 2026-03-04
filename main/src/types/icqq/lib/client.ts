import type { Platform } from './core/index';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'mark' | 'off';

export interface Config {
  platform?: Platform;
  data_dir?: string;
  log_level?: LogLevel;
  ffmpeg_path?: string;
  ffprobe_path?: string;
  sign_api_addr?: string;
  ver?: string;
  [key: string]: any;
}
