import { d as defineEventHandler, u as useDatabase, g as getQuery, s as sendRedirect } from '../../../nitro/nitro.mjs';
import { m as myFetch } from '../../../_/fetch.mjs';
import process from 'node:process';
import { SignJWT } from 'jose';
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

const github = defineEventHandler(async (event) => {
  const db = useDatabase();
  const userTable = db ? new UserTable(db) : void 0;
  if (!userTable) throw new Error("db is not defined");
  if (process.env.INIT_TABLE !== "false") await userTable.init();
  const response = await myFetch(
    `https://github.com/login/oauth/access_token`,
    {
      method: "POST",
      body: {
        client_id: process.env.G_CLIENT_ID,
        client_secret: process.env.G_CLIENT_SECRET,
        code: getQuery(event).code
      },
      headers: {
        accept: "application/json"
      }
    }
  );
  const userInfo = await myFetch(`https://api.github.com/user`, {
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `token ${response.access_token}`,
      // 必须有 user-agent，在 cloudflare worker 会报错
      "User-Agent": "NewsNow App"
    }
  });
  const userID = String(userInfo.id);
  await userTable.addUser(userID, userInfo.notification_email || userInfo.email, "github");
  const jwtToken = await new SignJWT({
    id: userID,
    type: "github"
  }).setExpirationTime("60d").setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode(process.env.JWT_SECRET));
  const params = new URLSearchParams({
    login: "github",
    jwt: jwtToken,
    user: JSON.stringify({
      avatar: userInfo.avatar_url,
      name: userInfo.name
    })
  });
  return sendRedirect(event, `/?${params.toString()}`);
});

export { github as default };
