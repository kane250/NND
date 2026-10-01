import { myFetch } from "../fetch"
import { defineSource } from "../define"
import { parseRelativeDate } from "../date"
import * as cheerio from "cheerio"
import type { NewsItem } from "../types"

export default defineSource(async () => {
  const response: ArrayBuffer = await myFetch("https://www.zaochenbao.com/realtime/", {
    responseType: "arrayBuffer",
  })
  const base = "https://www.zaochenbao.com"
  // 联合早报用 GBK 编码，TextDecoder 在大多数现代浏览器/WebView 中支持 'gbk'
  const utf8String = new TextDecoder("gbk").decode(new Uint8Array(response))
  const $ = cheerio.load(utf8String)
  const $main = $("div.list-block>a.item")
  const news: NewsItem[] = []
  $main.each((_, el) => {
    const a = $(el)
    const url = a.attr("href")
    const title = a.find(".eps")?.text()
    const date = a.find(".pdt10")?.text().replace(/-\s/g, " ")
    if (url && title && date) {
      news.push({
        url: base + url,
        title,
        id: url,
        pubDate: parseRelativeDate(date, "Asia/Shanghai").valueOf(),
      })
    }
  })
  return news.sort((m, n) => (n.pubDate! > m.pubDate! ? 1 : -1))
})
