# CampusDealing

校园互助工具「河小易」。项目包含原生微信小程序、Node.js API 和 SQLite 数据库。

## 产品定位

CampusDealing 只服务于单一校园，优先解决不值得邮寄、需要快速线下交接的需求：拼车搭子、出租、代取、代购、免费送和二手好物。

它不做全国电商，不做支付收款，不做长聊天，不做社区，也不做代课、代跑、刷课。

## 当前功能

- 首页搜索、功能分类、横向子分类和任务列表
- 发布求助或可提供服务，带完整输入校验
- 任务详情、参与、完成和软删除状态流转
- “求助 / 已接单 / 已完成”数据库真实统计
- 头像、姓名、学号与宿舍资料编辑
- 原生微信小程序端
- 后端接口自动化测试和小程序静态完整性测试

## 本地运行

项目现在使用 Node.js + SQLite 后端，不再依赖浏览器 `localStorage` 作为主数据源。

在项目根目录运行：

```powershell
node server.js
```

也可以使用 npm 启动：

```powershell
npm start
```

后端会监听 <http://127.0.0.1:8000>，数据库会自动创建在 `data/campus.db`，首次启动会写入演示任务。

微信开发者工具请导入 `miniprogram` 目录。本地调试默认请求 `http://127.0.0.1:8000/api`。

主要接口：

- `GET /api/posts`：任务列表，支持 `category` 和 `q` 筛选
- `POST /api/posts`：发布任务
- `GET /api/posts/:id`：任务详情
- `POST /api/posts/:id/claim`：抢单
- `POST /api/posts/:id/complete`：发布者标记完成
- `DELETE /api/posts/:id`：发布者软删除
- `GET /api/me`：个人资料和统计
- `PUT /api/profile`：保存个人资料

## 测试

```powershell
npm test
```

测试使用临时 SQLite 数据库，不会修改 `data/campus.db`。当前覆盖健康检查、列表、发布校验、参与、完成、删除、个人资料、统计以及小程序页面和资源完整性。

## 下一阶段

1. 使用正式小程序 AppID 接入 `wx.login` 和校园身份认证
2. 增加举报、内容审核、过期下架和管理员后台
3. 将 SQLite 迁移到国内云数据库
4. 配置国内 HTTPS 域名和微信 request 合法域名
5. 完成隐私协议、用户协议和小程序平台审核

## 设计原则

快速看懂、快速发布、快速线下交接。所有功能都服务于“校内见面拿走”，避免把产品做成闲鱼或社区软件。
