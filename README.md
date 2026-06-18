<p align="center">
  <img src="assets/logo.svg" alt="Warframe 裂罅狙击标志" width="128" height="128">
</p>

<h1 align="center">Warframe 裂罅狙击</h1>

<p align="center">
  面向武器系列的裂罅拍卖狙击工具，使用保守的 Warframe.Market 刷新逻辑。
</p>

<p align="center">
  <img alt="Node.js 20+" src="https://img.shields.io/badge/Node.js-20%2B-43853d">
  <img alt="版本 v1.1" src="https://img.shields.io/badge/%E7%89%88%E6%9C%AC-v1.1-d6a84c">
  <img alt="许可证 MIT" src="https://img.shields.io/badge/%E8%AE%B8%E5%8F%AF%E8%AF%81-MIT-d6a84c">
  <img alt="数据源 Warframe Market" src="https://img.shields.io/badge/%E6%95%B0%E6%8D%AE%E6%BA%90-warframe.market-78b7bd">
  <img alt="裂罅武器 423" src="https://img.shields.io/badge/%E8%A3%82%E7%BD%85%E6%AD%A6%E5%99%A8-423-1d1a14">
</p>

<p align="center">
  <img alt="简体中文" src="https://img.shields.io/badge/README-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-78b7bd?style=for-the-badge">
  <a href="README.en.md"><img alt="English" src="https://img.shields.io/badge/README-English-d6a84c?style=for-the-badge"></a>
</p>

这是一个用于追踪 Warframe 裂罅拍卖订单的小型网页应用。你可以按武器系列、正面词条、可选负面词条、卖家状态、价格和订单时间来管理裂罅狙击目标。

应用的核心流程很简单：在某个武器下创建一个或多个裂罅监控项，保守地刷新 Warframe.Market 拍卖数据，然后把匹配的可联系卖家订单展示出来，并提供可直接复制到游戏内私聊的消息。

### 功能

- 一个武器系列下可以管理多个裂罅。
- 使用生成的「可拥有裂罅」武器系列目录。
- 支持英文和中文武器名、词条名显示。
- 可按正面词条和负面词条过滤市场结果。
- 将 Warframe.Market 的 `online` 和 `ingame` 卖家都视为可联系卖家。
- 使用按武器分组、缓存复用和限流退避的刷新逻辑。
- 系统通知会提醒新的在线订单、低于最高价阈值的命中和限流等待状态。
- 本地裂罅配置保存在 `data/rivens.json`，并已被 git 忽略。

### 快速开始

```bash
npm install
npm start
```

打开 `http://localhost:4173`。

### 命令

| 命令 | 说明 |
| --- | --- |
| `npm start` | 启动本地网页服务器 |
| `npm test` | 运行 Node 测试套件 |
| `node scripts/build-riven-weapon-catalog.mjs` | 重新生成裂罅武器目录 |

### 架构

| 路径 | 作用 |
| --- | --- |
| `public/index.html` | 单页前端界面 |
| `server/app.js` | 静态文件服务和 JSON API 路由 |
| `server/market.js` | Warframe.Market 拍卖订单标准化、缓存、分组和限流处理 |
| `server/riven-weapons.generated.js` | 根据 Warframe Wiki 裂罅倾向表和 Warframe Status 本地化物品数据生成的武器目录 |
| `server/store.js` | 将本地裂罅监控项持久化到 `data/rivens.json` |
| `test/server.test.js` | 目录、API、市场数据、刷新逻辑和持久化测试 |

### 刷新逻辑

后端默认使用 2 分钟缓存窗口。刷新时会先按武器分组，每个武器只搜索一次，然后在本地为所有匹配的裂罅监控项过滤订单。

市场请求按顺序执行，每次请求间隔 1 秒。如果 Warframe.Market 返回 `429`，后端会对同一个武器进行渐进退避重试：`10s`、`20s`、`40s`。当追踪武器很多时，强制刷新会复用仍有效的按武器缓存，避免一次性刷新所有武器。

### 系统通知

网页内置通知中心会在三种情况下提醒：新的在线订单、订单价格低于该裂罅设置的最高价、Warframe.Market 限流等待。首次加载会先记录已有订单，避免把旧订单一次性弹出。

浏览器系统通知需要用户点击「启用浏览器通知」授权。授权成功后会立即发出一条测试通知，并写入网页内的「系统通知」中心。授权后可以使用「提示音」开关播放轻量提示音；提示音由 Web Audio 在浏览器内合成，不下载音频文件，也不会增加额外缓存。前端只保存最近 30 条通知和最近 500 个已见订单 key，不保存完整订单缓存，也不保存 Discord 或 QQ 的 webhook secret。

Discord / QQ 推送更适合放在后端服务器：用 `.env` 配置 webhook 或机器人 token，由服务器在产生通知事件时转发。不要把这类 secret 放到浏览器端或 localStorage。

### 已完成

- 系统通知：新的在线订单、低价阈值命中、限流等待、浏览器测试通知和提示音已经接入。

### 待办

0. 裂罅估值：根据武器、正负词条、价格区间和市场订单给出基础判断。
1. 在线演示版本：部署只读 Demo，让用户不用本地启动也能试用界面和流程。
2. 外部推送：在后端安全配置 Discord / QQ 推送，不把 webhook secret 暴露给网页。
3. Warframe.Market 快速联系：为卖家订单生成更快的联系入口和游戏内私聊消息。
4. 价格历史：记录同类裂罅的价格变化，辅助判断是否值得购买。
5. 云端同步：为后端服务器准备账号、数据库和跨设备裂罅配置同步。
6. 导入导出：支持备份、迁移和分享裂罅监控配置。

### 说明

- 本项目与 Digital Extremes 或 Warframe.Market 没有从属关系。
- Warframe 及相关名称属于其各自所有者的商标。
- 本地保存的裂罅监控项位于 `data/rivens.json`，该目录已被 git 忽略。

### 许可证

MIT。详见 `LICENSE`。
