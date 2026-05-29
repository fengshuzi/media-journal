# 书影音 - Obsidian 插件

基于日记文件的影视观看记录追踪插件，可以按年月查看观看历史和评论。

## 功能特点

### 📺 影视记录
- 支持电影、电视剧、综艺、书籍等多种类型
- 自动从日记文件中提取观看记录
- 记录标题和评论

### 📅 时间筛选
- 按年份查看观看记录
- 按月份查看观看记录
- 支持查看全年数据

### 📊 统计分析
- 总观看数统计
- 各类型观看数统计
- 按日期分组展示

### ⚙️ 灵活配置
- 自定义应用名称
- 自定义视频标签
- 自定义影视类型

## 安装方法

### 方式一：Obsidian 社区市场安装（推荐）

打开 Obsidian 设置 → 第三方插件 → 浏览，搜索 **书影音** 或 **fengshuzi** 即可安装。


### 方式一：从 GitHub Release 安装（推荐）

1. 前往 [Releases](../../releases) 页面下载最新版本
2. 下载以下文件：
   - `main.js`
   - `manifest.json`
   - `styles.css`
   - `config.json`
3. 在你的 Obsidian 库中创建插件目录：`.obsidian/plugins/obsidian-my-videos/`
4. 将下载的文件复制到该目录
5. 重启 Obsidian 或刷新插件列表
6. 在设置中启用"书影音"插件

### 方式二：手动安装

```bash
cd /path/to/your/vault/.obsidian/plugins
git clone https://github.com/你的用户名/obsidian-my-videos.git
cd obsidian-my-videos
npm install
npm run build
```

## 使用方法

### 1. 在日记中记录观看

在日记文件中使用以下格式记录观看：

```markdown
# 2024-01-11

- #video/movie 《肖申克的救赎》 经典之作，值得反复观看
- #video/tv 《权力的游戏》 史诗级剧集，制作精良
- #video/variety 《向往的生活》 轻松愉快的综艺节目
- #video/book 《三体》 刘慈欣的科幻巨作
```

### 2. 查看观看记录

1. 点击左侧边栏的 🎬 图标打开插件
2. 选择年份和月份
3. 查看该时间段的观看记录和统计

### 3. 配置插件

点击"配置"按钮可以：
- 修改应用名称
- 修改视频标签（默认 `#video`）
- 添加/删除/修改影视类型

## 标签格式

默认标签格式：`#video/类型`

- `#video/movie` - 电影
- `#video/tv` - 电视剧
- `#video/variety` - 综艺
- `#video/book` - 书籍

可以在配置中自定义标签前缀和类型。

## 记录格式

推荐格式：
```
- #video/类型 《标题》 评论内容
```

示例：
```
- #video/movie 《盗梦空间》 诺兰的神作，烧脑但精彩
- #video/tv 《绝命毒师》 剧情紧凑，演技炸裂
- #video/book 《百年孤独》 魔幻现实主义经典
```

## 配置说明

### 基础设置
- **应用名称**：自定义插件显示名称（默认"书影音"）
- **视频标签**：自定义标签前缀（如 `#video`、`#watch` 等）

### 类型管理
- 添加新的影视类型
- 修改现有类型的关键词和名称
- 删除不需要的类型

### 配置文件

插件使用 `config.json` 文件进行配置：

```json
{
    "appName": "书影音",
    "videoTypes": {
        "movie": "电影",
        "tv": "电视剧",
        "variety": "综艺",
        "book": "书籍"
    },
    "journalsPath": "journals"
}
```

## 文件要求

- 日记文件必须放在 `journals` 文件夹中
- 日记文件名必须是 `yyyy-mm-dd.md` 格式（如 `2024-01-11.md`）

## 开发

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 部署到本地vault
npm run deploy

# 发布到GitHub
npm run release
```

## License

MIT

---

🎬 **开始记录你的观影历程吧！**


---

## ☕ 请作者喝杯咖啡

如果这个插件帮助了你，欢迎扫码打赏，感谢支持！

<div align="center">
  <img src="./assets/wechat-donate.jpg" alt="微信打赏" width="200" />
  <p><sub>微信扫码打赏</sub></p>
</div>
