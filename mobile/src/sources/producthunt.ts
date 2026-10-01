import type { NewsItem } from "../types"
import { myFetch } from "../fetch"
import { defineSource, defineRSSSource } from "../define"

// Product Hunt：无 API token，直接用 RSS feed
const feed = defineRSSSource("https://www.producthunt.com/feed")

export default defineSource(async () => {
  return feed()
})
