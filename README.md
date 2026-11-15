# 杭州行程协同演示原型

课程模拟项目。订单、商品、价格、退改与办理结果均为虚构数据，不连接携程服务，不产生真实交易。

## 启动

需要 Node.js 22.13 或更新版本（使用内置 `node:sqlite`）。

```powershell
cd exp/system
npm install
npm run dev
```

打开 http://localhost:5173。首次启动会在 `data/demo.sqlite` 建立本地演示状态数据库；顶部“重置演示”可恢复初始状态。

系统源码分别位于 `frontend/` 与 `backend/`；架构决策记录位于 `docs/adr/`。npm 依赖、SQLite 数据和构建产物也由本目录管理。

前端使用 Vue 3 + Vite；Node 内置 HTTP 服务和 SQLite 提供 `/api/state`、`/api/confirm`、`/api/process`、`/api/reset` 接口。办理接口在方案确认前会拒绝请求。DeepSeek 暂未接入，演示主流程使用确定性模拟数据。
