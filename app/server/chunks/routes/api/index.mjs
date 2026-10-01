import { d as defineEventHandler } from '../../nitro/nitro.mjs';
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
import 'node:process';
import 'jose';

const index = defineEventHandler(() => {
  return {
    hello: "world"
  };
});

export { index as default };
