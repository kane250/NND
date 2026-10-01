import { myFetch } from "../fetch"
import { defineSource } from "../define"

interface Res {
  data: {
    word_list: {
      sentence_id: string
      word: string
      event_time: string
      hot_value: string
    }[]
  }
}

export default defineSource(async () => {
  const url = "https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1"
  // 获取 cookie（用 myFetch.raw）
  const raw = await (myFetch as any).raw("https://login.douyin.com/")
  const cookie = raw.headers.getSetCookie()
  const res: Res = await myFetch(url, {
    headers: {
      cookie: cookie.join("; "),
    },
  })
  return res.data.word_list.map((k) => {
    return {
      id: k.sentence_id,
      title: k.word,
      url: `https://www.douyin.com/hot/${k.sentence_id}`,
    }
  })
})
