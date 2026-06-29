# Media Journal

Track books, movies, TV shows, and variety programs from daily notes with tags, comments, and monthly stats.

## Features

- **Journal-based logging**: Capture entries directly in daily notes.
- **Flexible tags**: Support movies, TV, variety shows, and books.
- **Comments included**: Store title and short review in one line.
- **Monthly stats**: Filter by year and month with overview cards.
- **Custom labels**: Rename the app title and media types in settings.

## Installation

### Community marketplace (recommended)

Open Settings → Community plugins → Browse, then search for **Media Journal** or **fengshuzi**.

### GitHub Release

1. Download the latest release assets:
   - `main.js`
   - `manifest.json`
   - `styles.css`
   - `config.json`
2. Create `.obsidian/plugins/media-journal/` in your vault.
3. Copy the files into that folder.
4. Reload plugins and enable **Media Journal**.

### Manual build

```bash
cd /path/to/your/vault/.obsidian/plugins
git clone https://github.com/fengshuzi/media-journal.git
cd media-journal
npm install
npm run build
```

## Usage

Add entries in daily notes under `journals/yyyy-mm-dd.md`:

```markdown
# 2024-01-11

- #movie 《Inception》 A mind-bending classic.
- #tv 《Breaking Bad》 Tight pacing and great acting.
- #variety 《Happy Camp》 Light and fun.
- #book 《The Three-Body Problem》 A sci-fi landmark.
```

Open the sidebar ribbon icon or run **Open view** from the command palette to browse records and stats.

## Configuration

`config.json` example:

```json
{
    "appName": "Media Journal",
    "videoTypes": {
        "movie": "电影",
        "tv": "电视剧",
        "variety": "综艺",
        "book": "书籍"
    },
    "journalsPath": "journals"
}
```

## Development

```bash
npm run dev
npm run lint
npm run build
npm run deploy
npm run release
```

## License

MIT

---

## 中文说明

Media Journal（书影音）是基于日记文件的书影记录插件，支持电影、电视剧、综艺、书籍的标签记录、评论和按月统计。

在 Obsidian 社区插件中搜索 **Media Journal** 或 **fengshuzi** 安装。插件目录名为 `media-journal`。

---

## ☕ Support

If this plugin helps you, consider buying the author a coffee.

<div align="center">
  <img src="https://raw.githubusercontent.com/fengshuzi/images/main/wechat-donate.jpg" alt="Donate" width="200" />
  <p><sub>WeChat donate</sub></p>
</div>
