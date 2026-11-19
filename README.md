# 杭州行程协同演示原型

课程模拟项目。订单、商品、价格、退改与办理结果均为虚构数据，不连接携程服务，不产生真实交易。

## 启动

需要 Node.js 22.13 或更新版本（使用内置 `node:sqlite`）。

```powershell
cd exp/system
npm install
npm run dev
```

打开 http://localhost:5173。首次启动会在 `data/demo.sqlite` 建立本地演示状态数据库；顶部“重置演示”经确认后删除全部订单及订单冲突提醒，保留对话、行程、计划和收藏。

系统源码分别位于 `frontend/` 与 `backend/`；架构决策记录位于 `docs/adr/`。npm 依赖、SQLite 数据和构建产物也由本目录管理。

首次使用 AI 行程规划前，将 `.env.example` 复制为 `.env`，并填写 `DEEPSEEK_API_KEY`。密钥仅由后端读取，不要填写到前端文件或提交到 Git。默认使用 `deepseek-flash`，可通过 `DEEPSEEK_MODEL` 更换模型。

前端使用 Vue 3 + Vite；Node 内置 HTTP 服务和 SQLite 提供模拟办理接口，以及 `/api/projects` 行程、规划、提醒和偏好接口。机票、火车票和酒店可通过商品详情确认模拟下单，订单由 `/api/orders` 保存，默认不关联行程，用户可选择关联行程；总价由后端按演示商品单价、人数、房间数和入住晚数计算，不会真实出票、订房或扣款。新订单会核对冲突，并在无冲突时同步到行程；现有冲突处理中助手尚不会修改订单。统一跨项目冲突对话、单笔操作确认和每步后重评估已记录为后续核心功能。开发测试单仍使用独立的 `/api/dev/test-orders` 接口，不会出现在个人订单中。完整对话不持久化，只保存精简消息摘要与用户确认的长期偏好。DeepSeek 生成行程文字和日程安排；商品、价格与订单均由应用本地逻辑提供，模型不生成。

常用出行人保存在服务端 SQLite：`GET /api/travellers` 返回 `{ travellers: [...] }`；`POST /api/travellers` 接收 `{"name":"姓名","identityNumber":"证件号"}`，成功返回 201 和 `{ traveller: {...} }`。两个字段均为去除首尾空格后 1 至 100 字符的字符串，不校验真实身份证格式；证件号重复时返回 409。首次初始化写入三条演示数据，已有相同证件号的记录不会被覆盖；重启不会重复写入。接口沿用现有应用访问控制，数据为单用户演示用途。

开发期可用内部测试接口触发行程订单分析，不会创建真实交易，也不会出现在“我的订单”页面：

```powershell
node backend/scripts/create-test-order.js flight-HGH-1-out-1
node backend/scripts/create-test-order.js train-HGH-1-out-1 <projectId> 2027-06-12
node backend/scripts/create-test-order.js hotel-HGH-1 <projectId> 2027-06-12 2027-06-14
```

不传 `projectId` 时，测试订单会关联到最新的未开始行程。测试订单只支持开发环境；`NODE_ENV=production` 时相关接口不可用。运行 `npm run generate:products` 可重新生成包含交通日期、时刻和酒店可住日期范围的模拟商品数据。

## 地图景点数据

景点发现数据通过 Overpass API 按城市查询 OpenStreetMap，精选后写入前端静态模块；页面运行时不请求 POI 服务。当前种子覆盖省级行政中心和部分常用目的地。执行完整导入会逐城查询，请勿频繁重复运行：

```powershell
npm run import:map
```

每城最多收录 2、4 或 8 个点位；常规城市控制在 2 个，重点目的地上限较高。小范围测试可使用 `npm run import:map -- --limit-cities 1`；失败城市可通过 `--only-cities 兰州 太原` 定点重试并合并。结果写入 `frontend/src/travel-map-osm-points.js`；覆盖度取决于 OSM 社区收录情况，不是完整或实时景点目录。使用及再分发须保留 OpenStreetMap 署名并遵守 ODbL。
