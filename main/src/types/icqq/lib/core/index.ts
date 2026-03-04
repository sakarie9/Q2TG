/** 登录设备平台 */
export enum Platform {
  /** 安卓手机 */
  Android = 1,
  /** 安卓平板 */
  aPad = 2,
  /** 安卓手表 */
  Watch = 3,
  /** MacOS */
  iMac = 4,
  /** iPad */
  iPad = 5,
  /** Tim */
  Tim = 6,
}

// pb is only used in OicqClient via dynamic require. Declared here for TypeScript.
export declare const pb: {
  encode(obj: any): Uint8Array;
  decode(encoded: Buffer): any;
};

export type Domain = any;
export type ApiRejection = any;
export type Device = any;
export type Apk = any;
