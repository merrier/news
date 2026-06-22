# News

一个部署在 GitHub Pages 上的综合热榜站。

它借鉴 [ourongxing/newsnow](https://github.com/ourongxing/newsnow) 的数据源组织思路，但为了适配 GitHub Pages，采用静态站点方案：

- GitHub Actions 定时抓取热点数据
- 生成 `site/data/news.json`
- GitHub Pages 发布 `site/`

## 本地运行

```bash
npm run build
npm run serve
```

然后打开 <http://localhost:4173>。

## 数据源

当前首版覆盖：

- 国内：百度热搜、今日头条、知乎、澎湃新闻
- 财经：华尔街见闻、金十数据
- 科技：AIHOT、IT之家、Hacker News、Product Hunt、GitHub Trending
- 国际：BBC 中文

所有内容版权归原站点所有，本项目只做链接聚合。
