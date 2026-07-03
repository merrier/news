import { mkdir, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const outFile = join(root, "site/data/news.json")

const headers = {
  "User-Agent": "Mozilla/5.0 news-pages/0.1 (+https://github.com/merrier/news)",
  "Accept": "application/json,text/html,application/rss+xml,application/xml,*/*",
}

const sources = [
  {
    id: "baidu",
    name: "百度热搜",
    category: "国内",
    home: "https://top.baidu.com/board?tab=realtime",
    fetch: fetchBaidu,
  },
  {
    id: "toutiao",
    name: "今日头条",
    category: "国内",
    home: "https://www.toutiao.com",
    fetch: fetchToutiao,
  },
  {
    id: "zhihu",
    name: "知乎热榜",
    category: "国内",
    home: "https://www.zhihu.com",
    fetch: fetchZhihu,
  },
  {
    id: "thepaper",
    name: "澎湃新闻",
    category: "国内",
    home: "https://www.thepaper.cn",
    fetch: fetchThepaper,
  },
  {
    id: "wallstreetcn",
    name: "华尔街见闻",
    category: "财经",
    home: "https://wallstreetcn.com",
    fetch: fetchWallstreetcn,
  },
  {
    id: "jin10",
    name: "金十数据",
    category: "财经",
    home: "https://www.jin10.com",
    fetch: fetchJin10,
  },
  {
    id: "aihot",
    name: "AIHOT",
    category: "科技",
    home: "https://aihot.virxact.com/all",
    fetch: fetchAIHot,
  },
  {
    id: "ithome",
    name: "IT之家",
    category: "科技",
    home: "https://www.ithome.com",
    fetch: () => fetchRssSource("ithome", "https://www.ithome.com/rss/"),
  },
  {
    id: "hackernews",
    name: "Hacker News",
    category: "科技",
    home: "https://news.ycombinator.com",
    fetch: fetchHackerNews,
  },
  {
    id: "producthunt",
    name: "Product Hunt",
    category: "科技",
    home: "https://www.producthunt.com",
    fetch: () => fetchRssSource("producthunt", "https://www.producthunt.com/feed"),
  },
  {
    id: "github",
    name: "GitHub Trending",
    category: "科技",
    home: "https://github.com/trending",
    fetch: fetchGithubTrending,
  },
  {
    id: "bbc-zh",
    name: "BBC 中文",
    category: "国际",
    home: "https://www.bbc.com/zhongwen/simp",
    fetch: () => fetchRssSource("bbc-zh", "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml"),
  },
]

const results = await Promise.all(sources.map(async (source) => {
  try {
    const rawItems = await source.fetch()
    const items = normalizeItems(rawItems, source).slice(0, 30)
    return { source, items }
  } catch (error) {
    return {
      source,
      items: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}))

const errors = results
  .filter(result => result.error)
  .map(result => ({ source: result.source.name, message: result.error }))

const items = []
const seen = new Set()
for (const result of results) {
  result.items.forEach((item, index) => {
    const key = `${item.title}|${item.url}`
    if (seen.has(key)) return
    seen.add(key)
    items.push({
      ...item,
      rank: index + 1,
    })
  })
}

if (!items.length) {
  throw new Error(`No news items fetched. Errors: ${JSON.stringify(errors)}`)
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceProject: {
    name: "ourongxing/newsnow",
    url: "https://github.com/ourongxing/newsnow",
  },
  sources: results.map(result => ({
    id: result.source.id,
    name: result.source.name,
    category: result.source.category,
    home: result.source.home,
    count: result.items.length,
    ok: !result.error,
  })),
  items: sortItems(items),
  errors,
}

await mkdir(dirname(outFile), { recursive: true })
await writeFile(outFile, `${JSON.stringify(output, null, 2)}\n`)
console.log(`Wrote ${output.items.length} items from ${output.sources.filter(source => source.ok).length}/${sources.length} sources.`)
if (errors.length) {
  console.log(`Source errors: ${errors.map(error => `${error.source}: ${error.message}`).join("; ")}`)
}

function sortItems(items) {
  const categoryWeight = new Map([
    ["国内", 0],
    ["财经", 1],
    ["科技", 2],
    ["国际", 3],
  ])
  return items.sort((a, b) => {
    const categoryDiff = (categoryWeight.get(a.category) ?? 9) - (categoryWeight.get(b.category) ?? 9)
    if (categoryDiff) return categoryDiff
    return a.rank - b.rank
  })
}

function normalizeItems(items, source) {
  return items
    .map((item) => {
      const title = cleanText(item.title)
      const url = absolutize(item.url, source.home)
      if (!title || !url) return null
      return {
        id: `${source.id}:${item.id ?? shortHash(`${title}${url}`)}`,
        title,
        url,
        summary: cleanText(item.summary || item.hover || ""),
        info: cleanText(item.info || ""),
        publishedAt: normalizeDate(item.publishedAt || item.pubDate || item.date),
        sourceId: source.id,
        sourceName: source.name,
        sourceHome: source.home,
        category: source.category,
        favicon: faviconUrl(source.home),
      }
    })
    .filter(Boolean)
}

async function fetchBaidu() {
  const html = await requestText("https://top.baidu.com/board?tab=realtime")
  const match = html.match(/<!--s-data:(.*?)-->/s)
  if (!match) throw new Error("Cannot find Baidu embedded data")
  const data = JSON.parse(match[1])
  return data.data.cards[0].content
    .filter(item => !item.isTop)
    .map(item => ({
      id: item.rawUrl,
      title: item.word,
      url: item.rawUrl,
      summary: item.desc,
      info: item.hotScore ? `${item.hotScore}` : "",
    }))
}

async function fetchToutiao() {
  const data = await requestJson("https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc")
  return data.data.map(item => ({
    id: item.ClusterIdStr || item.ClusterId,
    title: item.Title,
    url: `https://www.toutiao.com/trending/${item.ClusterIdStr || item.ClusterId}/`,
    info: item.HotValue,
  }))
}

async function fetchZhihu() {
  const data = await requestJson("https://www.zhihu.com/api/v3/feed/topstory/hot-list-web?limit=30&desktop=true")
  return data.data.map(item => ({
    id: item.target?.link?.url || item.id,
    title: item.target?.title_area?.text,
    url: item.target?.link?.url,
    summary: item.target?.excerpt_area?.text,
    info: item.target?.metrics_area?.text,
  }))
}

async function fetchThepaper() {
  const data = await requestJson("https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar")
  return data.data.hotNews.map(item => ({
    id: item.contId,
    title: item.name,
    url: `https://www.thepaper.cn/newsDetail_forward_${item.contId}`,
    publishedAt: Number(item.pubTimeLong) || undefined,
  }))
}

async function fetchWallstreetcn() {
  const data = await requestJson("https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&limit=30")
  return data.data.items.map(item => ({
    id: item.id,
    title: item.title || item.content_text,
    url: item.uri,
    summary: item.content_short,
    publishedAt: item.display_time ? item.display_time * 1000 : undefined,
  }))
}

async function fetchJin10() {
  const raw = await requestText(`https://www.jin10.com/flash_newest.js?t=${Date.now()}`)
  const data = JSON.parse(raw.replace(/^var\s+newest\s*=\s*/, "").replace(/;*$/, "").trim())
  return data
    .filter(item => (item.data?.title || item.data?.content) && !item.channel?.includes(5))
    .map((item) => {
      const text = stripTags(item.data.title || item.data.content)
      const [, title, summary] = text.match(/^【([^】]*)】(.*)$/) ?? []
      return {
        id: item.id,
        title: title || text,
        url: `https://flash.jin10.com/detail/${item.id}`,
        summary,
        info: item.important ? "重要" : "",
        publishedAt: chinaTimeToIso(item.time),
      }
    })
}

async function fetchAIHot() {
  const data = await requestJson("https://aihot.virxact.com/api/public/items?mode=all&take=30")
  return data.items.map(item => ({
    id: item.id,
    title: item.title,
    url: item.url,
    summary: item.summary,
    info: item.category ? `${item.source} · ${item.category}` : item.source,
    publishedAt: item.publishedAt,
  }))
}

async function fetchHackerNews() {
  const data = await requestJson("https://hn.algolia.com/api/v1/search?tags=front_page")
  return data.hits.map(item => ({
    id: item.objectID,
    title: item.title,
    url: item.url || `https://news.ycombinator.com/item?id=${item.objectID}`,
    info: item.points ? `${item.points} points` : "",
    publishedAt: item.created_at,
  }))
}

async function fetchGithubTrending() {
  const html = await requestText("https://github.com/trending?spoken_language_code=")
  const articles = html.match(/<article[\s\S]*?<\/article>/g) || []
  return articles.map((article) => {
    const link = article.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!link) return null
    const title = cleanText(stripTags(link[2]).replace(/\s*\/\s*/, " / "))
    const desc = article.match(/<p[^>]*>([\s\S]*?)<\/p>/)
    const star = article.match(/href="[^"]*\/stargazers"[^>]*>([\s\S]*?)<\/a>/)
    return {
      id: link[1],
      title,
      url: `https://github.com${link[1]}`,
      summary: desc ? stripTags(desc[1]) : "",
      info: star ? `stars ${cleanText(stripTags(star[1]))}` : "",
    }
  }).filter(Boolean)
}

async function fetchRssSource(sourceId, url) {
  const xml = await requestText(url)
  return parseFeed(xml).map(item => ({
    ...item,
    id: item.id || `${sourceId}:${item.url}`,
  }))
}

async function requestJson(url) {
  const text = await requestText(url)
  return JSON.parse(text.replace(/^\uFEFF/, ""))
}

async function requestText(url) {
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.text()
}

function parseFeed(xml) {
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/g)
  if (itemBlocks?.length) {
    return itemBlocks.map(block => ({
      id: getTag(block, "guid") || getTag(block, "link"),
      title: getTag(block, "title"),
      url: getTag(block, "link"),
      summary: getTag(block, "description"),
      publishedAt: getTag(block, "pubDate"),
    }))
  }

  const entryBlocks = xml.match(/<entry\b[\s\S]*?<\/entry>/g) || []
  return entryBlocks.map(block => ({
    id: getTag(block, "id") || getAtomLink(block),
    title: getTag(block, "title"),
    url: getAtomLink(block),
    summary: getTag(block, "summary") || getTag(block, "content"),
    publishedAt: getTag(block, "updated") || getTag(block, "published"),
  }))
}

function getTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))
  return match ? cleanText(stripTags(match[1])) : ""
}

function getAtomLink(block) {
  const alternate = block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i)
  if (alternate) return decodeHtml(alternate[1])
  const first = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i)
  return first ? decodeHtml(first[1]) : ""
}

function stripTags(text) {
  return decodeHtml(String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " "))
}

function cleanText(text) {
  return decodeHtml(String(text || "").replace(/\s+/g, " ").trim())
}

function decodeHtml(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
}

function absolutize(url, base) {
  if (!url) return ""
  try {
    return new URL(url, base).toString()
  } catch {
    return ""
  }
}

function normalizeDate(value) {
  if (!value) return null
  if (typeof value === "number") return new Date(value).toISOString()
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? null : date.toISOString()
}

function chinaTimeToIso(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/)
  if (!match) return value
  const [, year, month, day, hour, minute, second] = match.map(Number)
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second)).toISOString()
}

function faviconUrl(home) {
  const domain = new URL(home).hostname
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
}

function shortHash(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 12)
}
