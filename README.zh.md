# dsh-shell-expand

> English: [README.md](./README.md)

一个 DeepSeek Harness 客户端插件：让一行 **shell 工具行**（`bash` 与 `pwsh`）在具备可展开内容的
那一刻就自动展开，于是「看这条命令到底跑了什么」不再需要点一下——前提是你正在看着这次调用。

它自己不画任何东西。上游的 shell 行已经会把长命令换行显示（而不是省略号截断），也已经把退出状态
做成标题旁的胶囊；本插件只补上「第一次展开」这一件事。

## 它做了什么

| | 上游行 | 本插件 |
|---|---|---|
| 正在运行、或在你眼前刚结束的调用 | 折叠 | **展开** |
| 重放/刷新后加载出来的历史调用 | 折叠 | 折叠——历史交给 Chat 的「收起时机」设置 |
| 已经折叠的 Turn 里的行 | 折叠 | 折叠——永不重新展开 |
| Turn 折叠时你正打开着的卡片 | 折叠 | 跟着折叠：这是框架自己的重置，插件不与之对抗 |
| 用户手动折叠的行 | 折叠 | 保持折叠 |
| 卡片内部的一切 | — | 不变：命令换行、带 ANSI 色的终端输出、复制控件、退出状态胶囊、高度上限 |

只处理 `bash` 与 `pwsh` 两类行，其它工具行一概不动。

**历史一律不展开，这是刻意的。** 上游折叠一个已完成的 Turn 用的是 CSS 隐藏，行仍然挂在 DOM 里：
再把它展开，等于让长对话里每一张已结束的命令卡都把输出留在 DOM 中。这也是本插件全部的性能立场
——只为「你正在看的这次调用」增加 DOM，什么时候收起由 Chat 的设置决定（回答完成后收起，或下次
发消息时收起）。

## 为什么需要它

dsh 0.2.1-rc.2 的上游行已经把命令放进终端卡片的 banner 并在那里换行，但一次 shell 调用无论运行中
还是已结束，初始仍然是折叠的——每次都要点一下才能看到命令。这个插件去掉的就是那一下。

## 实现方式

客户端半**不注册任何 slot、不导出任何组件、不带任何样式表**，只读上游行本来就公开的 DOM：

- **哪些行是 shell 行**：上游 `bash` 行自己的头部（`data-sample="bash"`，它同时就是展开目标），
  以及通用 Tool 行的 `data-variant` / `data-tool` 标记（`pwsh` 走的就是这条）。
- **靠什么展开**：每个 disclosure 行都带 `aria-expanded` + `data-expandable` 这一对属性；
  同时具备两者的元素就是该行正文的开关，点它就是上游公开的交互方式，插件只替用户按一次。
- **什么算「你正在看的」**：行上的 `data-state="running"`。以其它状态进入 DOM 的行视为历史，
  一律不动；preparing 阶段的调用是在观察器眼皮底下获得正文的，走「属性变更」那条路展开。

只有两种事件能触发展开：running 的行进入 DOM，或某行在观察期间获得可展开正文。`MutationObserver`
只听「新增节点」和上述两个属性，所以流式输出不会把它唤醒。每个调用**最多决定一次**——以
`data-chat-call-id` 为键，所以上游重新渲染换了元素也不会再决定一次——并且在
`[data-turn-process-hidden]`（已折叠的 Turn）里的行即使 disclosure 被重置也不动它：
重新展开等于把用户配置的收起时机撤销掉。卸载时断开观察器。

如果将来上游改了这几个标记名，结果只是那行保持折叠：插件会**静默降级**，绝不会破坏对话记录。

## 检查

| 命令 | 做什么 |
|---|---|
| `pnpm run typecheck` | 两个编译面（`tsc -p tsconfig.json`、`tsc -p tsconfig.client.json`） |
| `pnpm run test` | vitest 跑 `tests/auto-expand.spec.ts`（jsdom） |
| `pnpm run build` | tsdown 产出 `lib/index.js` + `lib/client.js` |
| `pnpm run check:bundle` | 在 jsdom 里通过 shell 的 `__ModuleLoader__` 门面加载真实的 `lib/client.js`，校验身份、确认它不请求任何平台模块，并在产物上验证自动展开行为 |
| `pnpm run check:portable` | typecheck → build → bundle 检查 |

**`pnpm run test` 起不来时用 `check:portable`。** 在受限的 Windows 文件沙箱下，vite 启动时用管道
子进程探测映射网络驱动器，会被沙箱拒绝（`optimizeSafeRealPathSync` 处的 `spawn EPERM`），于是
vitest 在加载任何 spec 之前就失败。`check:portable` 不经过打包器覆盖同样的内容，而 `check:bundle`
校验的是真实产物而不是源码。

## 安装

本插件就是一个普通的 dsh bundle，按常规方式装进 profile 即可。

### 从 GitHub 安装

```powershell
# 先 remove 再 add：pnpm 按 commit 缓存 git 源，不 remove 直接 add 可能装到上一个 commit 的产物。
dsh plugin --profile web remove dsh-shell-expand
dsh plugin --profile web add "github:ZYFDroid/dsh-shell-expand"
```

包名同时出现在三个地方，且三处都刻意**不带 npm scope**：pnpm 把它记为 profile 的依赖键，
bundle patch 把它作为层的 `name` 插入，插件列表又原样打印这个 `name`。所以一旦加 scope，
列表里就会显示成 `@scope/name`。`pnpm run check:bundle` 把这个显示形态钉住了，
改名不会静默通过。

### 从本地 tarball 安装（离线）

```powershell
# 1. 构建：lib/index.js（host 半）+ lib/client.js（浏览器半）。
pnpm install --node-linker=hoisted --ignore-scripts --store-dir ..\.pnpm-store
pnpm run build

# 2. 打一个可装进 profile 的 tarball（产出 dist\dsh-shell-expand.tgz）。
pnpm run pack

# 3. 先 remove 再 add。这一步会写 ~/.dsh，请按你的 DSH 文件策略所需的主机权限运行。
#    （pnpm 按路径缓存 tarball，改完重建后不 remove 可能装到旧内容。）
dsh plugin --profile web remove dsh-shell-expand
dsh plugin --profile web add "C:\Users\ZYFDroid\Documents\DSHStudy\dsh-shell-expand\dist\dsh-shell-expand.tgz"
```

> 0.2.0 重写了客户端半：它不再接管 toolview slot，所以还装着 `0.1.x` 的 profile 会继续用旧的行，
> 直到用上面的 remove + add 替换掉已装产物。同名内的升级本来就必须**先 `remove` 再 `add`**，
> 因为 tarball 路径与 git ref 都会被缓存。

然后重启 `dsh web`。客户端半在页面刷新后立即对对话记录生效；**不需要新开会话**，因为这行
只是对服务器已经在推送的 session log 做一次纯渲染改写。

请优先用上面两种方式，而不是 `dsh plugin --profile web add <本目录>`：在 Windows 上，
按本地目录安装会拼出错误的 `link:` junction 目标。tarball 另外还剥掉了 `devDependencies`——
它们只对开发有意义，并指向一个在使用者 profile 里并不存在的 harness checkout。

卸载：

```powershell
dsh plugin --profile web remove dsh-shell-expand
```

## 模型体验（Model Experience）

本插件是**纯客户端**的，只改变一条已记录的 Tool 调用如何显示：

- 不新增 host 半、不新增 tool、不新增 service；
- 不发出也不额外消费任何 session 事件；
- 模型看到的东西——tool schema、参数、结果、prompt——完全不变；
- session log 不被改动，所以装着本插件录下的会话，在不装插件时重放结果完全一致。

## 确认它已经生效

刷新页面后，检查对话记录里任意一行 shell：

- 该行元素带 **`data-shell-expand="opened"`**——上游行从不写这个属性，它出现就是插件处理过这行的
  最直接证据；
- 标题下面的卡片无需点击就是打开的；重新加载历史会话后依然是打开的；
- 手动折叠它，它会保持折叠——插件只展开过那一次，不会把它重新打开；
- 还没有结果的调用也会自己打开：判断会等到这行真正有正文时才执行；
- 想回到上游行为，卸载插件即可——行会重新变成折叠。

## 环境要求

| | |
|---|---|
| dsh | `>= 0.2.0-rc.2` |
| 行标记 | 上游 `bash` 头部（`data-sample="bash"`）、通用 Tool 行的 `data-variant` / `data-tool`、disclosure 的 `aria-expanded` + `data-expandable` |
| 客户端模块表 | 无——bundle 不导入任何模块 |

## 已知限制与暂缓事项

- **插件依赖上游行公开的 DOM 标记。** 这是「不单独维护一份卡片」的代价：标记一旦改名，那行只是
  保持折叠（静默降级），而不是报错。真要遇上，改 `src/client/index.ts` 里的一行即可，不需要
  重写整行。
- **没有「已运行时间」读数。** 那个必须有行自己的 header 才能画，只有接管才能做到。上游行不报
  运行时长，本插件也不再补。
- **被所在 Turn 隐藏后再显示的行会回到折叠状态**，与普通上游行一致。重新展开它会连带撤销用户
  自己做的折叠，那是更差的取舍。
- **卡片内部完全是上游行为**，包括终端输出的高度上限与命令 banner 自己的上限。超长命令在卡片
  内换行或滚动；要拉长它就得自己接管卡片。
