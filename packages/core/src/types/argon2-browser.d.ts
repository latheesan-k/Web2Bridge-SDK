declare module "argon2-browser" {
  interface Argon2Options {
    pass: string;
    salt: string;
    mem?: number;
    iter?: number;
    parallelism?: number;
    hashLen?: number;
    type?: number;
  }

  interface Argon2Result {
    hash: string;
    hashHex: string;
    encode: string;
  }

  interface Argon2Module {
    argon2id: number;
    hash(options: Argon2Options): Promise<Argon2Result>;
    init(): Promise<void>;
    free(): void;
  }

  const argon2: Argon2Module;
  export default argon2;
}
