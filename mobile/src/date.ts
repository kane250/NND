/**
 * 日期解析工具（从 server/utils/date.ts 移植，精简版）
 * 支持中文相对时间（"3小时前"、"昨天"、"周一"等）
 */

import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import customParseFormat from "dayjs/plugin/customParseFormat"
import duration from "dayjs/plugin/duration"
import isSameOrBefore from "dayjs/plugin/isSameOrBefore"
import weekday from "dayjs/plugin/weekday"

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(duration)
dayjs.extend(isSameOrBefore)
dayjs.extend(weekday)

/**
 * 传入任意时区的时间（不携带时区），转换为 UTC 时间
 */
export function tranformToUTC(date: string, format?: string, tz: string = "Asia/Shanghai"): number {
  if (!format) return dayjs.tz(date, tz).valueOf()
  return dayjs.tz(date, format, tz).valueOf()
}

function toDate(date: string) {
  return date
    .toLowerCase()
    .replace(/(^an?\s)|(\san?\s)/g, "1")
    .replace(/几|幾/g, "3")
    .replace(/[\s,]/g, "")
}

const patterns = [
  { unit: "years", regExp: /(\d+)(?:年|y(?:ea)?rs?)/ },
  { unit: "months", regExp: /(\d+)(?:[个個]?月|months?)/ },
  { unit: "weeks", regExp: /(\d+)(?:周|[个個]?星期|weeks?)/ },
  { unit: "days", regExp: /(\d+)(?:天|日|d(?:ay)?s?)/ },
  { unit: "hours", regExp: /(\d+)(?:[个個]?(?:小?时|[時点點])|h(?:(?:ou)?r)?s?)/ },
  { unit: "minutes", regExp: /(\d+)(?:分[鐘钟]?|m(?:in(?:ute)?)?s?)/ },
  { unit: "seconds", regExp: /(\d+)(?:秒[鐘钟]?|s(?:ec(?:ond)?)?s?)/ },
]

function toDurations(matches: string[]): Record<string, string> {
  const durations: Record<string, string> = {}
  let p = 0
  for (const m of matches) {
    for (; p <= patterns.length; p++) {
      const match = patterns[p]?.regExp.exec(m)
      if (match) {
        durations[patterns[p].unit] = match[1]
        break
      }
    }
  }
  return durations
}

export function parseRelativeDate(date: string, tz: string = "UTC"): Date {
  if (date === "刚刚") return new Date()

  const theDate = toDate(date)
  const matches = theDate.match(/\D*\d+(?![:\-/]|(a|p)m)\D+/g)
  const offset = dayjs.duration({
    hours: (dayjs().tz(tz).utcOffset() - dayjs().utcOffset()) / 60,
  })

  if (matches) {
    const lastMatch = matches.pop()
    if (lastMatch) {
      const beforeMatches = /(.*)(?:前|ago)$/.exec(lastMatch)
      if (beforeMatches) {
        matches.push(beforeMatches[1])
        return dayjs().subtract(dayjs.duration(toDurations(matches))).toDate()
      }
      const afterMatches = /(?:^in(.*)|(.*)[后後])$/.exec(lastMatch)
      if (afterMatches) {
        matches.push(afterMatches[1] ?? afterMatches[2])
        return dayjs().add(dayjs.duration(toDurations(matches))).toDate()
      }
      matches.push(lastMatch)
    }
    const firstMatch = matches.shift()
    if (firstMatch) {
      const words = getWords()
      for (const w of words) {
        const wordMatches = w.regExp.exec(firstMatch)
        if (wordMatches) {
          matches.unshift(wordMatches[1])
          return dayjs
            .tz(
              w.startAt
                .set("hour", 0)
                .set("minute", 0)
                .set("second", 0)
                .set("millisecond", 0)
                .add(dayjs.duration(toDurations(matches)))
                .add(offset),
              tz,
            )
            .toDate()
        }
      }
    }
  } else {
    const words = getWords()
    for (const w of words) {
      const wordMatches = w.regExp.exec(theDate)
      if (wordMatches) {
        return dayjs
          .tz(
            `${w.startAt.add(offset).format("YYYY-MM-DD")} ${
              /a|pm$/.test(wordMatches[1])
                ? wordMatches[1].replace(/a|pm/, " $&")
                : wordMatches[1]
            }`,
            tz,
          )
          .toDate()
      }
    }
  }
  return new Date(date)
}

function getWords() {
  return [
    { startAt: dayjs(), regExp: /^(?:今[天日]|to?day?)(.*)/ },
    { startAt: dayjs().subtract(1, "days"), regExp: /^(?:昨[天日]|y(?:ester)?day?)(.*)/ },
    { startAt: dayjs().subtract(2, "days"), regExp: /^(?:前天|(?:the)?d(?:ay)?b(?:eforeyesterda)?y)(.*)/ },
    {
      startAt: dayjs().isSameOrBefore(dayjs().weekday(1)) ? dayjs().weekday(1).subtract(1, "week") : dayjs().weekday(1),
      regExp: /^(?:周|星期)一(.*)/,
    },
    {
      startAt: dayjs().isSameOrBefore(dayjs().weekday(2)) ? dayjs().weekday(2).subtract(1, "week") : dayjs().weekday(2),
      regExp: /^(?:周|星期)二(.*)/,
    },
    {
      startAt: dayjs().isSameOrBefore(dayjs().weekday(3)) ? dayjs().weekday(3).subtract(1, "week") : dayjs().weekday(3),
      regExp: /^(?:周|星期)三(.*)/,
    },
    {
      startAt: dayjs().isSameOrBefore(dayjs().weekday(4)) ? dayjs().weekday(4).subtract(1, "week") : dayjs().weekday(4),
      regExp: /^(?:周|星期)四(.*)/,
    },
    {
      startAt: dayjs().isSameOrBefore(dayjs().weekday(5)) ? dayjs().weekday(5).subtract(1, "week") : dayjs().weekday(5),
      regExp: /^(?:周|星期)五(.*)/,
    },
    {
      startAt: dayjs().isSameOrBefore(dayjs().weekday(6)) ? dayjs().weekday(6).subtract(1, "week") : dayjs().weekday(6),
      regExp: /^(?:周|星期)六(.*)/,
    },
    {
      startAt: dayjs().isSameOrBefore(dayjs().weekday(7)) ? dayjs().weekday(7).subtract(1, "week") : dayjs().weekday(7),
      regExp: /^(?:周|星期)[天日](.*)/,
    },
  ]
}
