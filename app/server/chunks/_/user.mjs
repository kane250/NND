import { l as logger } from '../nitro/nitro.mjs';

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, key + "" , value);
class UserTable {
  constructor(db) {
    __publicField(this, "db");
    this.db = db;
  }
  async init() {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY,
        email TEXT,
        data TEXT,
        type TEXT,
        created INTEGER,
        updated INTEGER
      );
    `).run();
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_user_id ON user(id);
    `).run();
    logger.success(`init user table`);
  }
  async addUser(id, email, type) {
    const u = await this.getUser(id);
    const now = Date.now();
    if (!u) {
      await this.db.prepare(`INSERT INTO user (id, email, data, type, created, updated) VALUES (?, ?, ?, ?, ?, ?)`).run(id, email, "", type, now, now);
      logger.success(`add user ${id}`);
    } else if (u.email !== email && u.type !== type) {
      await this.db.prepare(`UPDATE user SET email = ?, updated = ? WHERE id = ?`).run(email, now, id);
      logger.success(`update user ${id} email`);
    } else {
      logger.info(`user ${id} already exists`);
    }
  }
  async getUser(id) {
    return await this.db.prepare(`SELECT id, email, data, created, updated FROM user WHERE id = ?`).get(id);
  }
  async setData(key, value, updatedTime = Date.now()) {
    const state = await this.db.prepare(
      `UPDATE user SET data = ?, updated = ? WHERE id = ?`
    ).run(value, updatedTime, key);
    if (!state.success) throw new Error(`set user ${key} data failed`);
    logger.success(`set ${key} data`);
  }
  async getData(id) {
    const row = await this.db.prepare(`SELECT data, updated FROM user WHERE id = ?`).get(id);
    if (!row) throw new Error(`user ${id} not found`);
    logger.success(`get ${id} data`);
    return row;
  }
  async deleteUser(key) {
    const state = await this.db.prepare(`DELETE FROM user WHERE id = ?`).run(key);
    if (!state.success) throw new Error(`delete user ${key} failed`);
    logger.success(`delete user ${key}`);
  }
}

export { UserTable as U };
