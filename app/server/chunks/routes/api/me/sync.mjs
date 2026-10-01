import { d as defineEventHandler, u as useDatabase, r as readBody, l as logger, c as createError } from '../../../nitro/nitro.mjs';
import process from 'node:process';
import { U as UserTable } from '../../../_/user.mjs';
import 'node:crypto';
import 'node:path';
import 'node:fs';
import 'better-sqlite3';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:url';
import 'consola';
import 'jose';

function isRecord(target) {
  return typeof target === "object" && target !== null && !Array.isArray(target);
}
function verifyPrimitiveMetadata(target) {
  if (!isRecord(target) || typeof target.updatedTime !== "number" || !isRecord(target.data)) {
    throw new Error("Invalid primitive metadata");
  }
  for (const sources2 of Object.values(target.data)) {
    if (!Array.isArray(sources2) || !sources2.every((source) => typeof source === "string")) {
      throw new Error("Invalid primitive metadata");
    }
  }
}

const sync = defineEventHandler(async (event) => {
  try {
    const { id } = event.context.user;
    const db = useDatabase();
    if (!db) throw new Error("Not found database");
    const userTable = new UserTable(db);
    if (process.env.INIT_TABLE !== "false") await userTable.init();
    if (event.method === "GET") {
      const { data, updated } = await userTable.getData(id);
      return {
        data: data ? JSON.parse(data) : void 0,
        updatedTime: updated
      };
    } else if (event.method === "POST") {
      const body = await readBody(event);
      verifyPrimitiveMetadata(body);
      const { updatedTime, data } = body;
      await userTable.setData(id, JSON.stringify(data), updatedTime);
      return {
        success: true,
        updatedTime
      };
    }
  } catch (e) {
    logger.error(e);
    throw createError({
      statusCode: 500,
      message: e instanceof Error ? e.message : "Internal Server Error"
    });
  }
});

export { sync as default };
