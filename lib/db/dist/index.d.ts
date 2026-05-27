import pg from "pg";
import * as schema from "./schema";
export declare const pool: pg.Pool;
export declare const db: import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema> & {
    $client: pg.Pool;
};
export * from "./schema";
//# sourceMappingURL=index.d.ts.map