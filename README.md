# Chengxi Baby Log 🍼

新生儿日常记录 App：喂奶、尿布、睡觉、体重、疫苗/就医事件，一家人一起记、实时同步。

- **App 端**（本仓库）：React Native + Expo，Android / iPhone 双端
- **Web 端**：`web/` 目录，Vite + React，手机/桌面自适应，在线体验 https://kids.appifa.com
- **服务端**：PocketBase，一键部署见 `server/` 目录

## 功能

- 🍼 喂奶：亲喂计时（左/右胸）、瓶喂记毫升数
- 💩 尿布：尿湿 / 便便 / 混合，一键记录
- 😴 睡觉：计时 + 补录时长
- ⚖️ 体重：kg 记录
- 📌 事件：疫苗 / 就医 / 其他
- ✏️ 补录：忘了记的，选时间补上
- 👨‍👩‍👧 家庭共享：邀请码加入，全家数据实时互通（Realtime）
- 📤 CSV 导出：带去医院给医生看
- 🌙 深色模式（默认，适合半夜记奶）

## 技术方案

- 本地优先：expo-sqlite + Drizzle ORM，离线可记，写操作 0 延迟
- 同步：本地写 → 同步队列 → 后台排空 → PocketBase；远端变更经 Realtime 拉回，LWW 解决冲突
- 同一后端同时服务 App 与 Web 端，字段映射一致

## 目录结构

```
app/            # Expo App（本仓库根目录即 app/ 内容）
web/            # Web 端（Vite + React）
server/         # 服务端一键部署（docker-compose + deploy.sh）
pb/             # PocketBase 表结构初始化脚本
pb_hooks/       # PocketBase 自定义 hook（邀请码加入、创建幂等）
```

## 本地运行

```bash
cd app
npm install
npx expo start
```

## 打包（EAS）

```bash
cd app
eas build -p android --profile preview
```

## 后端部署

```bash
cd server
./deploy.sh   # 构建 web → 同步到 VPS → docker-compose 启动 → nginx 重载 → 验证
```

## License

MIT
