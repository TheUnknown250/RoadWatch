import pg from 'pg'

export type Db = pg.Pool

export type SslMode = 'off' | 'require' | 'verify'

export function sslOption(mode: SslMode): pg.PoolConfig['ssl'] {
  if (mode === 'require') return { rejectUnauthorized: false }
  return mode === 'verify' ? true : undefined
}

export function createPool(
  connectionString: string,
  ssl: SslMode = 'off',
  max = 10,
): Db {
  return new pg.Pool({
    connectionString,
    max,
    ssl: sslOption(ssl),
  })
}
/** Run `fn` inside a transaction; rolls back on any thrown error. */
export async function withTx<T>(db: Db, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
