import * as stream from 'stream';
import * as zlib from 'zlib';

/** 性别 */
export type Gender = 'male' | 'female' | 'unknown';
/** 群内权限 */
export type GroupRole = 'owner' | 'admin' | 'member';

// The following are declared but not available at runtime in this stub.
// OicqClient provides these at runtime via dynamic require('@icqqjs/icqq').

/** xml转义 */
export declare function escapeXml(str: string): string;
/** promisified gzip */
export declare const gzip: typeof zlib.gzip.__promisify__;
/** unix timestamp (second) */
export declare const timestamp: () => number;

export interface UserProfile {
  regTimestamp: number;
  signature: string;
  QID: string;
  nickname: string;
  country: string;
  province: string;
  city: string;
  email: string;
  birthday: [number, number, number];
}
