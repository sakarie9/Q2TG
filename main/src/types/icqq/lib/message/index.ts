export * from './elements';

// Runtime declarations: OicqClient loads these via dynamic require('@icqqjs/icqq/lib/message')
// These type declarations are only used for TypeScript compilation.

export type Image = any;

export declare class Converter {
  rich: any;
  imgs: Image[];
  constructor(content: any, options?: any);
}

export declare function rand2uuid(rand: number): bigint;
