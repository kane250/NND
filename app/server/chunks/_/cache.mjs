import { u as useDatabase, l as logger } from '../nitro/nitro.mjs';
import process from 'node:process';

var v2ex = {
	redirect: "v2ex-share",
	name: "V2EX",
	column: "tech",
	home: "https://v2ex.com/",
	color: "slate",
	interval: 600000,
	title: "最新分享"
};
var zhihu = {
	name: "知乎",
	type: "hottest",
	column: "china",
	home: "https://www.zhihu.com",
	color: "blue",
	interval: 600000
};
var weibo = {
	title: "实时热搜",
	name: "微博",
	type: "hottest",
	column: "china",
	home: "https://weibo.com",
	color: "red",
	interval: 120000
};
var zaobao = {
	name: "联合早报",
	type: "realtime",
	desc: "来自第三方网站: 早晨报",
	column: "world",
	home: "https://www.zaobao.com",
	color: "red",
	interval: 1800000
};
var coolapk = {
	title: "今日最热",
	name: "酷安",
	type: "hottest",
	column: "tech",
	home: "https://coolapk.com",
	color: "green",
	interval: 600000
};
var mktnews = {
	redirect: "mktnews-flash",
	name: "MKTNews",
	column: "finance",
	home: "https://mktnews.net",
	color: "indigo",
	interval: 120000,
	title: "快讯"
};
var wallstreetcn = {
	redirect: "wallstreetcn-quick",
	name: "华尔街见闻",
	type: "realtime",
	column: "finance",
	home: "https://wallstreetcn.com/",
	color: "blue",
	interval: 300000,
	title: "快讯"
};
var douyin = {
	name: "抖音",
	type: "hottest",
	column: "china",
	home: "https://www.douyin.com",
	color: "gray",
	interval: 600000
};
var hupu = {
	title: "主干道热帖",
	name: "虎扑",
	type: "hottest",
	column: "sports",
	home: "https://hupu.com",
	color: "red",
	interval: 600000
};
var dongqiudi = {
	title: "头条",
	name: "懂球帝",
	type: "realtime",
	column: "sports",
	home: "https://www.dongqiudi.com",
	color: "green",
	interval: 600000
};
var aihot = {
	name: "AIHOT",
	type: "realtime",
	column: "tech",
	home: "https://aihot.virxact.com/all",
	color: "blue",
	interval: 300000
};
var tieba = {
	title: "热议",
	name: "百度贴吧",
	type: "hottest",
	column: "china",
	home: "https://tieba.baidu.com",
	color: "blue",
	interval: 600000
};
var toutiao = {
	name: "今日头条",
	type: "hottest",
	column: "china",
	home: "https://www.toutiao.com",
	color: "red",
	interval: 600000
};
var ithome = {
	name: "IT之家",
	type: "realtime",
	column: "tech",
	home: "https://www.ithome.com",
	color: "red",
	interval: 600000
};
var thepaper = {
	title: "热榜",
	name: "澎湃新闻",
	type: "hottest",
	column: "china",
	home: "https://www.thepaper.cn",
	color: "gray",
	interval: 1800000
};
var sputniknewscn = {
	name: "卫星通讯社",
	column: "world",
	home: "https://sputniknews.cn",
	color: "orange",
	interval: 600000
};
var cankaoxiaoxi = {
	name: "参考消息",
	column: "world",
	home: "https://china.cankaoxiaoxi.com",
	color: "red",
	interval: 1800000
};
var pcbeta = {
	redirect: "pcbeta-windows11",
	name: "远景论坛",
	type: "realtime",
	column: "tech",
	home: "https://bbs.pcbeta.com",
	color: "blue",
	interval: 300000,
	title: "Win11"
};
var cls = {
	redirect: "cls-telegraph",
	name: "财联社",
	type: "realtime",
	column: "finance",
	home: "https://www.cls.cn",
	color: "red",
	interval: 300000,
	title: "电报"
};
var xueqiu = {
	redirect: "xueqiu-hotstock",
	name: "雪球",
	type: "hottest",
	column: "finance",
	home: "https://xueqiu.com",
	color: "blue",
	interval: 120000,
	title: "热门股票"
};
var gelonghui = {
	title: "事件",
	name: "格隆汇",
	type: "realtime",
	column: "finance",
	home: "https://www.gelonghui.com",
	color: "blue",
	interval: 120000
};
var fastbull = {
	redirect: "fastbull-express",
	name: "法布财经",
	type: "realtime",
	column: "finance",
	home: "https://www.fastbull.cn",
	color: "emerald",
	interval: 120000,
	title: "快讯"
};
var solidot = {
	name: "Solidot",
	column: "tech",
	home: "https://solidot.org",
	color: "teal",
	interval: 3600000
};
var hackernews = {
	name: "Hacker News",
	type: "hottest",
	column: "tech",
	home: "https://news.ycombinator.com/",
	color: "orange",
	interval: 600000
};
var producthunt = {
	name: "Product Hunt",
	type: "hottest",
	column: "tech",
	home: "https://www.producthunt.com/",
	color: "red",
	interval: 600000
};
var github = {
	redirect: "github-trending-today",
	name: "Github",
	type: "hottest",
	column: "tech",
	home: "https://github.com/",
	color: "gray",
	interval: 600000,
	title: "Today"
};
var bilibili = {
	redirect: "bilibili-hot-search",
	name: "哔哩哔哩",
	type: "hottest",
	column: "china",
	home: "https://www.bilibili.com",
	color: "blue",
	interval: 600000,
	title: "热搜"
};
var kuaishou = {
	name: "快手",
	type: "hottest",
	disable: "cf",
	column: "china",
	home: "https://www.kuaishou.com",
	color: "orange",
	interval: 600000
};
var kaopu = {
	name: "靠谱新闻",
	desc: "不一定靠谱，多看多思考",
	column: "world",
	home: "https://kaopu.news/",
	color: "gray",
	interval: 1800000
};
var jin10 = {
	name: "金十数据",
	type: "realtime",
	column: "finance",
	home: "https://www.jin10.com",
	color: "blue",
	interval: 600000
};
var baidu = {
	name: "百度热搜",
	type: "hottest",
	column: "china",
	home: "https://www.baidu.com",
	color: "blue",
	interval: 600000
};
var nowcoder = {
	name: "牛客",
	type: "hottest",
	column: "china",
	home: "https://www.nowcoder.com",
	color: "blue",
	interval: 600000
};
var sspai = {
	name: "少数派",
	type: "hottest",
	column: "tech",
	home: "https://sspai.com",
	color: "red",
	interval: 600000
};
var juejin = {
	name: "稀土掘金",
	type: "hottest",
	column: "tech",
	home: "https://juejin.cn",
	color: "blue",
	interval: 600000
};
var ifeng = {
	title: "热点资讯",
	name: "凤凰网",
	type: "hottest",
	column: "china",
	home: "https://www.ifeng.com",
	color: "red",
	interval: 600000
};
var chongbuluo = {
	redirect: "chongbuluo-latest",
	name: "虫部落",
	column: "china",
	home: "https://www.chongbuluo.com/forum.php?mod=guide&view=newthread",
	color: "green",
	interval: 1800000,
	title: "最新"
};
var douban = {
	title: "热门电影",
	name: "豆瓣",
	type: "hottest",
	column: "china",
	home: "https://www.douban.com",
	color: "green",
	interval: 600000
};
var steam = {
	title: "在线人数",
	name: "Steam",
	type: "hottest",
	column: "world",
	home: "https://store.steampowered.com",
	color: "blue",
	interval: 600000
};
var tencent = {
	redirect: "tencent-hot",
	name: "腾讯新闻",
	type: "hottest",
	column: "china",
	home: "https://news.qq.com/tag/aEWqxLtdgmQ=",
	color: "blue",
	interval: 1800000,
	title: "综合早报"
};
var freebuf = {
	title: "网络安全",
	name: "Freebuf",
	type: "hottest",
	column: "china",
	home: "https://www.freebuf.com/",
	color: "green",
	interval: 600000
};
var qqvideo = {
	redirect: "qqvideo-tv-hotsearch",
	name: "腾讯视频",
	type: "hottest",
	column: "china",
	home: "https://v.qq.com/channel/tv",
	color: "blue",
	interval: 1800000,
	title: "热搜榜"
};
var iqiyi = {
	redirect: "iqiyi-hot-ranklist",
	name: "爱奇艺",
	type: "hottest",
	column: "china",
	home: "https://www.iqiyi.com",
	color: "green",
	interval: 1800000,
	title: "热播榜"
};
const _sources = {
	v2ex: v2ex,
	"v2ex-share": {
	name: "V2EX",
	column: "tech",
	home: "https://v2ex.com/",
	color: "slate",
	interval: 600000,
	title: "最新分享"
},
	zhihu: zhihu,
	weibo: weibo,
	zaobao: zaobao,
	coolapk: coolapk,
	mktnews: mktnews,
	"mktnews-flash": {
	name: "MKTNews",
	column: "finance",
	home: "https://mktnews.net",
	color: "indigo",
	interval: 120000,
	title: "快讯"
},
	wallstreetcn: wallstreetcn,
	"wallstreetcn-quick": {
	name: "华尔街见闻",
	type: "realtime",
	column: "finance",
	home: "https://wallstreetcn.com/",
	color: "blue",
	interval: 300000,
	title: "快讯"
},
	"wallstreetcn-news": {
	name: "华尔街见闻",
	column: "finance",
	home: "https://wallstreetcn.com/",
	color: "blue",
	interval: 1800000,
	title: "最新"
},
	"wallstreetcn-hot": {
	name: "华尔街见闻",
	type: "hottest",
	column: "finance",
	home: "https://wallstreetcn.com/",
	color: "blue",
	interval: 1800000,
	title: "最热"
},
	"36kr": {
	redirect: "36kr-quick",
	name: "36氪",
	type: "realtime",
	disable: "cf",
	column: "tech",
	home: "https://36kr.com",
	color: "blue",
	interval: 600000,
	title: "快讯"
},
	"36kr-quick": {
	name: "36氪",
	type: "realtime",
	disable: "cf",
	column: "tech",
	home: "https://36kr.com",
	color: "blue",
	interval: 600000,
	title: "快讯"
},
	"36kr-renqi": {
	name: "36氪",
	type: "hottest",
	disable: "cf",
	column: "tech",
	home: "https://36kr.com",
	color: "blue",
	interval: 600000,
	title: "人气榜"
},
	douyin: douyin,
	hupu: hupu,
	dongqiudi: dongqiudi,
	aihot: aihot,
	tieba: tieba,
	toutiao: toutiao,
	ithome: ithome,
	thepaper: thepaper,
	sputniknewscn: sputniknewscn,
	cankaoxiaoxi: cankaoxiaoxi,
	pcbeta: pcbeta,
	"pcbeta-windows11": {
	name: "远景论坛",
	type: "realtime",
	column: "tech",
	home: "https://bbs.pcbeta.com",
	color: "blue",
	interval: 300000,
	title: "Win11"
},
	cls: cls,
	"cls-telegraph": {
	name: "财联社",
	type: "realtime",
	column: "finance",
	home: "https://www.cls.cn",
	color: "red",
	interval: 300000,
	title: "电报"
},
	"cls-depth": {
	name: "财联社",
	column: "finance",
	home: "https://www.cls.cn",
	color: "red",
	interval: 600000,
	title: "深度"
},
	"cls-hot": {
	name: "财联社",
	type: "hottest",
	column: "finance",
	home: "https://www.cls.cn",
	color: "red",
	interval: 600000,
	title: "热门"
},
	xueqiu: xueqiu,
	"xueqiu-hotstock": {
	name: "雪球",
	type: "hottest",
	column: "finance",
	home: "https://xueqiu.com",
	color: "blue",
	interval: 120000,
	title: "热门股票"
},
	gelonghui: gelonghui,
	fastbull: fastbull,
	"fastbull-express": {
	name: "法布财经",
	type: "realtime",
	column: "finance",
	home: "https://www.fastbull.cn",
	color: "emerald",
	interval: 120000,
	title: "快讯"
},
	"fastbull-news": {
	name: "法布财经",
	column: "finance",
	home: "https://www.fastbull.cn",
	color: "emerald",
	interval: 1800000,
	title: "头条"
},
	solidot: solidot,
	hackernews: hackernews,
	producthunt: producthunt,
	github: github,
	"github-trending-today": {
	name: "Github",
	type: "hottest",
	column: "tech",
	home: "https://github.com/",
	color: "gray",
	interval: 600000,
	title: "Today"
},
	bilibili: bilibili,
	"bilibili-hot-search": {
	name: "哔哩哔哩",
	type: "hottest",
	column: "china",
	home: "https://www.bilibili.com",
	color: "blue",
	interval: 600000,
	title: "热搜"
},
	"bilibili-hot-video": {
	name: "哔哩哔哩",
	type: "hottest",
	disable: "cf",
	column: "china",
	home: "https://www.bilibili.com",
	color: "blue",
	interval: 600000,
	title: "热门视频"
},
	"bilibili-ranking": {
	name: "哔哩哔哩",
	type: "hottest",
	disable: "cf",
	column: "china",
	home: "https://www.bilibili.com",
	color: "blue",
	interval: 1800000,
	title: "排行榜"
},
	kuaishou: kuaishou,
	kaopu: kaopu,
	jin10: jin10,
	baidu: baidu,
	nowcoder: nowcoder,
	sspai: sspai,
	juejin: juejin,
	ifeng: ifeng,
	chongbuluo: chongbuluo,
	"chongbuluo-latest": {
	name: "虫部落",
	column: "china",
	home: "https://www.chongbuluo.com/forum.php?mod=guide&view=newthread",
	color: "green",
	interval: 1800000,
	title: "最新"
},
	"chongbuluo-hot": {
	name: "虫部落",
	type: "hottest",
	column: "china",
	home: "https://www.chongbuluo.com/forum.php?mod=guide&view=hot",
	color: "green",
	interval: 1800000,
	title: "最热"
},
	douban: douban,
	steam: steam,
	tencent: tencent,
	"tencent-hot": {
	name: "腾讯新闻",
	type: "hottest",
	column: "china",
	home: "https://news.qq.com/tag/aEWqxLtdgmQ=",
	color: "blue",
	interval: 1800000,
	title: "综合早报"
},
	freebuf: freebuf,
	qqvideo: qqvideo,
	"qqvideo-tv-hotsearch": {
	name: "腾讯视频",
	type: "hottest",
	column: "china",
	home: "https://v.qq.com/channel/tv",
	color: "blue",
	interval: 1800000,
	title: "热搜榜"
},
	iqiyi: iqiyi,
	"iqiyi-hot-ranklist": {
	name: "爱奇艺",
	type: "hottest",
	column: "china",
	home: "https://www.iqiyi.com",
	color: "green",
	interval: 1800000,
	title: "热播榜"
}
};

const sources = _sources;

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, key + "" , value);
class Cache {
  constructor(db) {
    __publicField(this, "db");
    this.db = db;
  }
  async init() {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS cache (
        id TEXT PRIMARY KEY,
        updated INTEGER,
        data TEXT
      );
    `).run();
    logger.success(`init cache table`);
  }
  async set(key, value) {
    const now = Date.now();
    await this.db.prepare(
      `INSERT OR REPLACE INTO cache (id, data, updated) VALUES (?, ?, ?)`
    ).run(key, JSON.stringify(value), now);
    logger.success(`set ${key} cache`);
  }
  async get(key) {
    const row = await this.db.prepare(`SELECT id, data, updated FROM cache WHERE id = ?`).get(key);
    if (row) {
      logger.success(`get ${key} cache`);
      return {
        id: row.id,
        updated: row.updated,
        items: JSON.parse(row.data)
      };
    }
  }
  async getEntire(keys) {
    var _a;
    const keysStr = keys.map((k) => `id = '${k}'`).join(" or ");
    const res = await this.db.prepare(`SELECT id, data, updated FROM cache WHERE ${keysStr}`).all();
    const rows = (_a = res.results) != null ? _a : res;
    if (rows == null ? void 0 : rows.length) {
      logger.success(`get entire (...) cache`);
      return rows.map((row) => ({
        id: row.id,
        updated: row.updated,
        items: JSON.parse(row.data)
      }));
    } else {
      return [];
    }
  }
  async delete(key) {
    return await this.db.prepare(`DELETE FROM cache WHERE id = ?`).run(key);
  }
}
async function getCacheTable() {
  try {
    const db = useDatabase();
    if (process.env.ENABLE_CACHE === "false") return;
    const cacheTable = new Cache(db);
    if (process.env.INIT_TABLE !== "false") await cacheTable.init();
    return cacheTable;
  } catch (e) {
    logger.error("failed to init database ", e);
  }
}

export { getCacheTable as g, sources as s };
