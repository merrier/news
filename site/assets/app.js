const categories = ["全部", "国内", "财经", "科技", "国际"]
const state = {
  data: null,
  category: "全部",
  sourceId: "all",
  query: "",
}

const els = {
  updatedAt: document.querySelector("#updatedAt"),
  refreshButton: document.querySelector("#refreshButton"),
  searchInput: document.querySelector("#searchInput"),
  categoryTabs: document.querySelector("#categoryTabs"),
  sourceCount: document.querySelector("#sourceCount"),
  sourceList: document.querySelector("#sourceList"),
  feedTitle: document.querySelector("#feedTitle"),
  itemCount: document.querySelector("#itemCount"),
  errorCount: document.querySelector("#errorCount"),
  newsList: document.querySelector("#newsList"),
  emptyState: document.querySelector("#emptyState"),
}

init()

function init() {
  renderTabs()
  els.refreshButton.addEventListener("click", () => loadData(true))
  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase()
    render()
  })
  loadData()
}

async function loadData(force = false) {
  els.updatedAt.textContent = force ? "正在刷新" : "正在读取"
  els.refreshButton.disabled = true
  try {
    const suffix = force ? `?t=${Date.now()}` : ""
    const response = await fetch(`./data/news.json${suffix}`, { cache: force ? "reload" : "default" })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    state.data = await response.json()
    render()
  } catch (error) {
    els.newsList.innerHTML = `<div class="notice">读取失败：${escapeHtml(error.message)}</div>`
    els.updatedAt.textContent = "读取失败"
  } finally {
    els.refreshButton.disabled = false
  }
}

function renderTabs() {
  els.categoryTabs.innerHTML = categories.map(category => `
    <button class="tab ${category === state.category ? "active" : ""}" type="button" data-category="${category}" role="tab" aria-selected="${category === state.category}">
      ${category}
    </button>
  `).join("")

  els.categoryTabs.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.category = button.dataset.category
      state.sourceId = "all"
      renderTabs()
      render()
    })
  })
}

function render() {
  if (!state.data) return

  const generated = state.data.generatedAt ? new Date(state.data.generatedAt) : null
  els.updatedAt.textContent = generated ? `更新于 ${formatDate(generated)}` : "暂无更新时间"

  const visibleSources = state.data.sources.filter(source => state.category === "全部" || source.category === state.category)
  els.sourceCount.textContent = visibleSources.length
  els.sourceList.innerHTML = sourceButtons(visibleSources)
  els.sourceList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.sourceId = button.dataset.source
      render()
    })
  })

  const filtered = state.data.items.filter((item) => {
    const categoryMatch = state.category === "全部" || item.category === state.category
    const sourceMatch = state.sourceId === "all" || item.sourceId === state.sourceId
    const queryText = `${item.title} ${item.sourceName} ${item.summary} ${item.info}`.toLowerCase()
    const queryMatch = !state.query || queryText.includes(state.query)
    return categoryMatch && sourceMatch && queryMatch
  })

  const selectedSource = state.data.sources.find(source => source.id === state.sourceId)
  els.feedTitle.textContent = selectedSource ? selectedSource.name : `${state.category}热点`
  els.itemCount.textContent = `${filtered.length} 条`
  els.errorCount.hidden = !state.data.errors?.length
  els.errorCount.textContent = `${state.data.errors?.length || 0} 个源失败`
  els.emptyState.hidden = filtered.length !== 0
  els.newsList.innerHTML = filtered.map(renderItem).join("")
}

function sourceButtons(sources) {
  const allCount = state.data.items.filter(item => state.category === "全部" || item.category === state.category).length
  const rows = [
    `<button class="source-row ${state.sourceId === "all" ? "active" : ""}" type="button" data-source="all">
      <span class="source-icon all">全</span>
      <span>全部来源</span>
      <strong>${allCount}</strong>
    </button>`,
  ]

  sources.forEach((source) => {
    rows.push(`
      <button class="source-row ${state.sourceId === source.id ? "active" : ""}" type="button" data-source="${source.id}">
        <img class="source-icon" src="${favicon(source.home)}" alt="" loading="lazy">
        <span>${escapeHtml(source.name)}</span>
        <strong>${source.count}</strong>
      </button>
    `)
  })

  return rows.join("")
}

function renderItem(item) {
  const summary = item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""
  const info = [item.info, relativeTime(item.publishedAt)].filter(Boolean).join(" · ")
  return `
    <article class="news-item">
      <div class="rank">${item.rank}</div>
      <div class="item-main">
        <div class="item-meta">
          <img src="${item.favicon}" alt="" loading="lazy">
          <span>${escapeHtml(item.sourceName)}</span>
          <span>${escapeHtml(item.category)}</span>
        </div>
        <a class="item-title" href="${item.url}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>
        ${summary}
        ${info ? `<div class="item-info">${escapeHtml(info)}</div>` : ""}
      </div>
      <a class="open-link" href="${item.url}" target="_blank" rel="noreferrer" aria-label="打开原文" title="打开原文">↗</a>
    </article>
  `
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function relativeTime(value) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return ""
  const diffMinutes = Math.round((date.valueOf() - Date.now()) / 60000)
  const abs = Math.abs(diffMinutes)
  const formatter = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" })
  if (abs < 60) return formatter.format(diffMinutes, "minute")
  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, "hour")
  return formatter.format(Math.round(diffHours / 24), "day")
}

function favicon(home) {
  return `https://www.google.com/s2/favicons?domain=${new URL(home).hostname}&sz=64`
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
