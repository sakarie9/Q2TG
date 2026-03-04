// Contactable is the base class for icqq Group/Friend.
// This stub exists so TypeScript can compile; at runtime
// any instanceof Contactable checks will always be false
// (they should be replaced with instanceof OicqClient checks).
export declare abstract class Contactable {
  protected readonly c: any;
  abstract dm: boolean;
  get client(): any;
  get target(): number;
  uploadImages(imgs: any[]): Promise<any>;
  sendMsg(content: any, source?: any): Promise<any>;
  getPttUrl?(elem: any): Promise<string>;
}
