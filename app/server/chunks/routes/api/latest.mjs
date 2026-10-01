import { d as defineEventHandler } from '../../nitro/nitro.mjs';
import { V as Version } from '../../_/consts.mjs';
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

const latest = defineEventHandler(async () => {
  return {
    v: Version
  };
});

export { latest as default };
