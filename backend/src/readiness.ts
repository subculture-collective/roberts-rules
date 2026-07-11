interface ReadinessDatabase {
  query<T extends { ready: boolean }>(sql: string): Promise<{ rows: T[] }>
}

export async function isWritablePrimary(database: ReadinessDatabase): Promise<boolean> {
  const result = await database.query<{ ready: boolean }>(
    "SELECT NOT pg_is_in_recovery() AND current_setting('transaction_read_only') = 'off' AS ready",
  );
  return result.rows[0]?.ready === true;
}
