import { d as defineEventHandler } from '../../nitro/nitro.mjs';
import process from 'node:process';
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

const enableLogin = defineEventHandler(async () => {
  return {
    enable: true,
    url: `https://github.com/login/oauth/authorize?client_id=${process.env.G_CLIENT_ID}`
  };
});

export { enableLogin as default };
