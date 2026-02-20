declare module 'sql.js' {
  export default function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<{
    Database: new (data?: Uint8Array) => SqlJsDatabase;
  }>;

  export interface SqlJsDatabase {
    run(sql: string, params?: unknown[] | Record<string, unknown>): void;
    exec(sql: string): unknown[];
    prepare(sql: string): SqlJsStatement;
    export(): Uint8Array;
    close(): void;
  }

  export interface SqlJsStatement {
    bind(values?: unknown[] | Record<string, unknown>): boolean;
    step(): boolean;
    get(): unknown[];
    getAsObject(): Record<string, unknown>;
    free(): void;
  }
}
