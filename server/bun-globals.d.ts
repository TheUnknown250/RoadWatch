/** The only Bun runtime API the server uses outside tests: Argon2id password hashing. */
declare const Bun: {
  password: {
    hash(password: string, options?: { algorithm: 'argon2id' }): Promise<string>
    verify(password: string, hash: string): Promise<boolean>
  }
}
