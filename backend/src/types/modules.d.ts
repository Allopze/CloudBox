// Type declarations for modules without @types packages

declare module 'sharp' {
  interface Sharp {
    resize(width?: number, height?: number, options?: any): Sharp;
    toFormat(format: string, options?: any): Sharp;
    webp(options?: any): Sharp;
    jpeg(options?: any): Sharp;
    png(options?: any): Sharp;
    toFile(path: string): Promise<any>;
    toBuffer(): Promise<Buffer>;
    metadata(): Promise<{
      width?: number;
      height?: number;
      format?: string;
      size?: number;
    }>;
  }

  interface SharpStatic {
    (input?: string | Buffer): Sharp;
    cache(options: boolean | { files?: number; memory?: number; items?: number }): void;
  }

  const sharp: SharpStatic;
  export = sharp;
}

declare module 'google-auth-library' {
  export class OAuth2Client {
    constructor(clientId?: string, clientSecret?: string, redirectUri?: string);
    verifyIdToken(options: { idToken: string; audience: string }): Promise<{
      getPayload(): {
        email?: string;
        name?: string;
        picture?: string;
        sub?: string;
        email_verified?: boolean;
      } | undefined;
    }>;
  }
}
