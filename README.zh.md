# dsh-shell-expand

> 英文版：[README.md](./README.md)

一个 DeepSeek Harness 客户端插件：接管对话记录里的 **shell 工具行**（`bash` 与
`pwsh`），只改两件渲染上的事：

1. **每张 shell 卡片默认展开。** 不需要点一下——命令和输出一出现就是可见的，
   历史会话回放同样如此。
2. **命令在卡片内部自动换行，不再被压成一行省略掉后面。** 终端卡片的命令横幅按需要铺成
   任意多行；同时 header 里**不再重复显示命令**，所以一条长命令只会出现一次。

其余一切保持系统自带行的画法：同样的几何尺寸与 `--dsw-*` 设计变量、同样的「失败时图标
让位给状态点」、同样的 hover 箭头交互、同样的 `TerminalBlock` 输出面（ANSI 颜色、复制
按钮、退出码 pill、高度上限），以及同样的 IN/OUT 兜底卡片——用于那些没有终端卡片的
shell 调用（持久 shell、spill 预览、被取消的调用）。

## 对照官方行

| | 自带 `bash` 行 | 本插件 |
|---|---|---|
| 默认状态 | 折叠 | **展开** |
| header 第二行 | 调用的 `description`（单行，省略号截断） | 同样是 `description`；调用没有它时用自带的参数摘要 |
| **命令运行中** | 终端的**运行态卡片**：命令行按 `pre` 不换行，且只显示 description | 终端的**运行态卡片**，命令行被重绑为 `pre-wrap`，按需折行；**并显示已运行时间** |
| 已运行时间 | 无 | header 末尾一枚读数，**全行只有这一处**，收起/展开都可见；命令结束即消失 |
| 读数格式 | — | 调用**自己声明了** `timeoutMs` 时显示 `19s / 30s`（已运行 / 超时）；没声明则只显示 `19s` |
| 命令显示位置 | 只在卡片的命令横幅里 | 同样只在卡片里；终端卡不接管的调用（后台/持久 shell）另给一条运行态命令行 |
| 命令文本出现次数 | 1 次（卡片内） | **1 次**，header 不再重复 |

### 关于「已运行时间」

开始时间取自工具调用 block 上的 `time`（该阶段开始的 epoch 毫秒），框架对每个调用都会盖这个戳，所以是本插件可靠能拿到的真值。读数每秒刷新一次，命令一结算就停止计时并移除标签（不会留下定时器）。

因为是**每次从 `time` 现算**（`now - block.time`）而不是本地累加，刷新页面或切换会话后重挂载会从正确位置继续：不会回到 0，也不会把旧计时累加。每个实例的定时器在卸载时清掉，不会出现两个定时器同时跑。

读数**只有一处**（header 末尾）。曾经在卡片上方也渲染过同一读数，结果刷新重挂载时看起来像「一个时间变成两个」——同一条信息不该有两个家。

超时只在**调用自己传了 `timeoutMs`** 时显示，格式 `19s / 30s`。没传就只显示 `19s`。

为什么不去补默认值：**「生效的超时」是在本层之下才被决定的** —— 默认值来自执行器配置（`bash-local` / `pwsh-local` 是 `120_000`），还会被各自的 `maxTimeoutMs` 夹紧，持久 shell 又是另一套（`300_000`）。从参数里读数只能拿到**请求的**值，把假设的默认值拼上去等于编造一个数字。传了就是真的，没传就不显示。

四个已经踩过并在代码与检查里固定下来的坑：

- **命令不再进 header。** 早期版本把命令也渲染在 header，结果长命令会**同时**撑满 summary
  行和卡片横幅，形成两处大段文字。现在 summary 只放 `description`。
- **结算判定必须用 `phase`，不能用 block 的判别字段。** 早期版本照官方示例写了
  `'kind' in block` 来判定「已结算」。那是个代理判断：一旦某个 start 阶段的 block 带上
  `kind`，运行中的调用就被当成已结算，参数随即从（尚不存在的）结果 call head 取到空串 ——
  卡片消失，兜底 JSON 顶替命令。现在 `settled = phase === 'result'`，`phase` 是框架自己
  给出的阶段声明。
- **按 phase 拆成两个组件。** keyed 行的组件实例会跨越 `preparing → start → result` 存活，
  而 `useToolCallArgumentsPartial` 只在 preparing 阶段有效。把两个阶段塞进同一个组件，会让
  Hook 数量在阶段切换时**减少**，React 直接抛 **#300（Rendered fewer hooks than
  expected）**，现场表现就是「新命令一片空白，控制台报 `slot entry crashed in
  'tool.call.toolview'`」。现在 `ShellRow` 只做分发，preparing 与已派发各是独立组件；切换
  组件类型即卸载重建，Hook 列表恒定。
- **运行中的调用也要有命令横幅。** 终端卡片此前只从**结果** block 推导，所以命令还没结束时
  根本没有卡片，行只能退回到「参数 JSON」兜底卡片；而那份 JSON 又刻意剥掉了 `command`，
  于是屏幕上只剩 `{description, timeoutMs}`。现在运行中的调用也会走终端卡推导
  （`runningCallBlock`），命令在横幅里按需折行；终端卡确实不接管的调用（后台运行、持久
  shell）则给一条同样换行的运行态命令行。兜底 JSON 也**不再剥掉** `command`。

## 为什么需要它

自带的 `bash` toolview 折叠态是调用的 `description`——一行不换行、带
`text-overflow: ellipsis`——而命令被放在终端卡片的横幅里，横幅是否换行要靠一个 CSS 变量
选择加入，自带渲染器把它留在 `pre`。于是长命令在行展开之前根本读不到，即使展开，横幅也
只能滚动着一行一行看。

本插件保留了「用户主动收起时的一行预览」，但默认就把行展开；命令的完整可见交给卡片横幅，
由它按需换行——header 不参与显示命令，也就不存在「同一串命令出现两遍」的问题。

## 检查

| 命令 | 跑什么 |
|---|---|
| `pnpm run typecheck` | 两个编译器面（`tsc -p tsconfig.json`、`tsc -p tsconfig.client.json`） |
| `pnpm run test` | vitest 跑 `tests/shell-row.spec.tsx` |
| `pnpm run check:model` | 直接对源码跑纯推导函数，用 Node 自带的类型擦除（不经过打包器） |
| `pnpm run build` | 用 tsdown 产出 `lib/index.js` + `lib/client.js` |
| `pnpm run check:bundle` | 通过 shell 的 `__ModuleLoader__` 门面加载构建产物 `lib/client.js`，校验注册契约与样式表契约 |
| `pnpm run check:portable` | typecheck → 模型检查 → 构建 → 产物检查 |

**当 `pnpm run test` 起不来时，跑 `check:portable`。** 在受限的 Windows 文件系统沙箱下，
vite 启动时会用管道子进程探测映射的网络驱动器，而沙箱会拒绝（`optimizeSafeRealPathSync`
抛出 `spawn EPERM`），vitest 于是一个 spec 都加载不到就失败。`check:portable` 这条链路
不经过打包器，覆盖同样的内容；而 `check:bundle` 检查的是**发布产物**而不是源码。

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

> 0.1.9 去掉了 `@dsh-external/` 前缀，所以从 0.1.8 及更早版本升级需要**两条**命令：
> 先 `dsh plugin --profile web remove @dsh-external/dsh-shell-expand` 清掉旧键，
> 再执行上面的 add 写入新键。同名内的升级仍然是**必须先 `remove` 再 `add`**，
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

## 接管是怎么做的

插件注册进 ui-tool 的 keyed 原子 Tool 视图槽 `tool.call.toolview`，占 `bash` 与 `pwsh`
两个键：

```ts
ctx.slots.inject('tool.call.toolview', function* () {
  for (const key of ['bash', 'pwsh']) {
    yield ctx.slots.register({
      name: 'tool.call.toolview', key, locale: 'conversation', priority: -1,
    }, ShellRow)
  }
})
```

keyed 槽渲染一个键上**优先级最低**的那份注册，所以 `-1` 在本插件挂载期间压过自带的
`bash` 行；插件卸载后自带行原样回来。`pwsh` 上游没有自带的 toolview（落到通用行），因此
这份注册是补上一个，而不是替换什么。

该行在本地推导自己的模型（`src/client/model.ts`），而不是导入自带的推导：那些推导位于
另一个包的 `src/` 子路径之后，插件的 `exports` 驱动型类型解析够不到；自己复制一份也能让
这个 bundle 不必携带第二个包的私有模块图。

## 模型体验（Model Experience）

本插件**纯客户端**。它读取客户端本来就有的 Tool 调用与结果事件，换一种方式渲染：

- 不新增 host 半、不新增工具、不新增服务；
- 不发出任何 session 事件，也不改变任何事件的消费方式；
- 模型所看到的东西——工具 schema、参数、结果、提示词——一律不变；
- session log 完全不被触碰，所以带着本插件录下的一段会话，在没有它的情况下回放结果一致。

## 确认它已经生效

刷新页面后，检查对话记录里任意一个 shell 行：

- 行上带有 `data-shell-row`、`data-tool="bash"`（或 `"pwsh"`），以及
  **`data-wraps`**——自带行没有 `data-wraps`，所以它出现就等于接管已经挂上，一眼可辨；
- 头部下方的卡片不用点就是展开的，重新加载一段历史会话后依然是展开的；
- 头部第二行只有 `description`；命令只在卡片的命令横幅里出现一次，且横幅按需折成多行
  （横幅宽度窄的时候，命令末尾的内容应当自动落到下一行，而不是被省略号吃掉）；
- **命令还在运行、结果未出时，卡片里就应该显示要运行的命令**（运行态命令行），而不是只有
  `{description, timeoutMs}` 这样的参数 JSON；
- **命令运行中应有一枚每秒刷新的读数**（只在 header 末尾一处），内容为 `19s`，或在调用声明了
  `timeoutMs` 时为 `19s / 30s`；命令结束后标签消失；刷新页面或切换会话后应从正确位置继续，
  且**仍然只有一处**；
- **新发起的命令不会空白。** 0.1.0 的空白是 React #300 造成的；如果又出现空白，看一眼
  控制台有没有 `slot entry crashed in 'tool.call.toolview'`；
- 想回到自带行为，卸载插件即可——自带的 `bash` 行会以优先级 `0` 回来。

## 环境要求

| | |
|---|---|
| dsh | `>= 0.2.0-rc.2` |
| 槽契约 | `tool.call.toolview`（keyed，session 作用域） |
| 客户端模块表 | `react`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-primitives` |

## 已知限制与暂缓事项

- **接管只是视觉层，因此无法补充 wire 上没有携带的信息。** 参数始终没有到达的 shell 调用
  （调用与结果之间被窗口切断）渲染成通用兜底卡片，而不是命令。
- **自带行目前没有使用 `priority: -1`**，所以本插件赢得该键。将来若有组合在 `-1` 之下注册
  同一个键，赢的会是它；槽对**同一优先级**的两次注册是直接报错而不是静默选一个，因此这种
  冲突会在加载时暴露出来。
- **多行命令以 `pre-wrap` 换行。** here-doc 的缩进被原样保留，所以缩进很深的命令依然会产生
  宽行，并在自身前导空白把它推到的地方换行；要重新排版就意味着改写这行被要求逐字展示的命令
  文本。
- **命令横幅自身有 150px 高度上限（primitive 自带）。** 极端长的命令（几十行）会在横幅内部
  滚动；这是官方 primitive 的行为，本插件只把它的换行打开，没有动它的上限。
- **输出区域保留自带的 224px 高度上限。** 很深的输出在卡片内部滚动，而不是把对话记录拉长。
