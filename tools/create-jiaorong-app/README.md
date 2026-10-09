# create-jiaorong-app

交融应用脚手架 CLI：一条命令按问答生成一个可直接在开发者中心创建的应用目录。模板就是包内示例应用 `app-scaffold/`，与生成器同包维护，没有第二份。

## 用法

```bash
# 按当前目录名一路问答生成
pnpm create jiaorong-app

# 生成到 ./my-app
pnpm create jiaorong-app my-app

# npm 等价写法
npm create jiaorong-app@latest
npm create jiaorong-app@latest my-app

# 不要官方 UI 组件，给极简对话页
npx create-jiaorong-app my-app --no-ui

# 全用默认值，不问
npx create-jiaorong-app my-app --yes
```

只需要 Node 18 以上，不依赖 JiaorongAI 客户端。

问答分三步：先定应用 id 与名称（后面的端口默认值按 id 派生），再选挂载位置、功能开关、端口与智能体 key，最后确认要不要立刻装依赖。命令行已经给出的项不再问；`Ctrl+C` 直接退出，不留半成品目录。

## 选项

| 选项 | 说明 | 默认 |
| --- | --- | --- |
| `--id <应用 id>` | 小写字母、数字、单个横线，例如 `my-app` | 目录名规范化后的值 |
| `--name <应用名称>` | 客户端里显示的名字 | 同应用 id |
| `--slot <位置>` | `app-center` 或 `menu` | `app-center` |
| `--version <版本号>` | 三段式 | `1.0.0` |
| `--description <简介>` | 写进 `app.json` | 同应用名称 |
| `--agent-key <key>` | 智能体 key，同 key 重复创建复用同一条 | `workbench` |
| `--agent-name <名称>` | 智能体显示名 | 应用名 + 助手 |
| `--dev-port <端口>` | 前端调试端口，写进 `vite.config.ts`，调试时把 `entry` 改成该地址 | `5174` |
| `--port <端口>` | 本机服务桥端口，HTTP 端口是它 +1 | 按应用 id 派生 |
| `--http-port <端口>` | 单独指定 HTTP 端口 | 桥端口 +1 |
| `--entry <dev\|build>` | `app.json` 的 `entry` 写 `web-ui/index.html` 还是调试地址 | `build` |
| `--no-ui` | 不带官方 UI 组件，改用极简对话页 | 带 |
| `--no-router` | 不带路由，`App.vue` 直接挂对话页 | 带 |
| `--no-skill` | 不带技能模板 | 带 |
| `--pm <包管理器>` | `pnpm` / `npm` / `yarn` / `none` | `pnpm` |
| `--no-install` | 生成后不装依赖 | 装 |
| `--yes`, `-y` | 全用默认值，不问；目录非空时也直接覆盖 | — |
| `--help`, `-h` | 看说明 | — |

端口按应用 id 散列派生到 40000~49999 的偶数起点，同时打开多个应用不会撞口；客户端不探口、不管冲突，所以生成前会校验调试端口、桥端口、HTTP 端口三者互不相同。

命令行给的值全部在生成前校验（应用 id、版本号、挂载位置、entry、包管理器、智能体 key、三个端口），任一项不合法就整条报错退出，不会生成出半成品目录。

## 退出码

从 JiaorongAI 客户端调用时，这些码会原样透传，脚本与 CI 可以直接判。

| 退出码 | 含义 |
| --- | --- |
| `0` | 全部成功 |
| `1` | 目录已生成，但装依赖或构建失败；按打印出来的提示补跑即可 |
| `2` | 参数不合法，或非交互终端下目录非空又没给 `--yes` |
| `7` | 用户取消（问答里选「取消」或按 `Ctrl+C` / `Esc`） |
| `8` | 目录没生成出来的其它失败 |

非交互终端（管道、CI）里问不了覆盖：目录非空时要么加 `--yes` 直接覆盖，要么换一个目录名，否则退 `2`。

`Ctrl+C` 在问答阶段（文本题与方向键菜单）算用户取消，退 `7`，不留任何文件；到了装依赖或构建阶段，目录已经生成好了，这时打断按「部分完成」退 `1`。

## 生成结果

```text
my-app/
  app.json          # id / name / entry / slot / spawn 已按问答写好
  icon.png
  web/              # Vue 源码，pnpm dev 起在 --dev-port
  node/             # 本机服务，spawn 拉起，业务代码在 node/service/
  skill/example/    # 技能模板，换成你自己的技能；--no-skill 时没有这一层
```

`web/` 与 `node/` 的包名、两个端口、智能体 key 与名称、日志前缀、页面标题与顶栏文案都会跟着应用 id 走。选了 `--no-ui` 会去掉官方组件与 `tailwindcss`、`@iconify/vue`、`less` 依赖，对话页换成自己渲染的极简版；选了 `--no-router` 会去掉 `vue-router`；选了 `--no-skill` 会去掉 `skill/` 与技能常量，提示词不再引用 `SKILL.md`。

生成时已装依赖并把 `web` 构建进 `web-ui/`（`app.json` 的 `entry` 默认指向它），直接到 JiaorongAI → 开发者中心 → 创建应用选这个目录即可。调试时把 `entry` 改成 `http://127.0.0.1:<调试端口>/` 并跑 `pnpm run dev`。

## 技能模板

带技能时只给一份模板技能 `skill/example/SKILL.md`，内容就是使用说明：怎么改目录名与 frontmatter 的 `name`、`description` 怎么写模型才知道何时激活、正文怎么换成自己的步骤，以及改完要同步 `node/config.js` 的 `SKILLS` / `DEFAULT_SKILL` 与 `web/src/constants.ts` 的 `CHAT_SLASH_ITEMS`。

技能全名 `app.<应用 id>.<目录名>` 由宿主拼，应用里只写目录名。`SKILLS` 的第一份由 `DEFAULT_SKILL` 指定为每轮必读，其余由模型按 `description` 自行判断是否改读。

## 改哪儿

- 应用内容（页面、本机服务、技能、`app.json` 默认字段）：只改包内 `app-scaffold/`，生成直接读它，改完立即生效。
- 生成行为（问法、功能开关、写配置、下一步文案、CLI 参数）：改本包 `bin/` 与 `lib/`。
- 开关关闭时的替代文件内容：改本包 `variants/`（不带官方 UI 的极简对话页在 `variants/no-ui/`）。

## 示例应用即模板

`app-scaffold/` 是脚手架唯一的内容源，与生成器同包：生成时直接拷它，没有同步产物、没有第二份。它同时是客户端的内置示例应用——开发态内置应用根目录指向本包目录，安装包走 extraResources `jiaorong-apps/app-scaffold`。

拷贝只取源码：跳过 `node_modules`、`web-ui`、`dist`、`run`、`logs`、`.git`、`vendor` 与压缩包；包内以 `_gitignore` 存放忽略清单（npm 发包会吃掉点文件），落盘到项目时改回 `.gitignore`。

模板改写全部走锚点正则，并声明期望命中次数（见 `lib/edit-file.js`）：示例应用改了写法，这里会立刻报错，不会静默生成一份配置不一致的项目。

## 目录

```text
create-jiaorong-app/
  bin/create-jiaorong-app.js   # 入口：解析参数、非空目录确认、非交互终端降级、退出码收口
  lib/errors.js                # 退出码与 UsageError，数字与 src/cli/errors.ts 对齐
  lib/rules.js                 # 校验规则、默认值、按应用 id 派生端口
  lib/prompts.js               # 三段式问答与配置归一化
  lib/scaffold.js              # 拷模板 → 裁剪 → 写配置 → 装依赖 → 打印下一步
  lib/prune.js                 # 按开关裁剪：技能、UI 组件、路由
  lib/replace.js               # 配置写进模板的锚点替换表
  lib/edit-file.js             # 锚点替换、JSON 改写、删依赖
  variants/                    # 覆盖模板用的文件，每个开关一个子目录
  app-scaffold/                # 示例应用：模板唯一内容源，也是客户端内置示例应用
```

## 发布

发布目标已经钉在 `publishConfig.registry`：即使 `~/.npmrc` 里配的是 npmmirror 只读镜像，`npm publish` 也会推到 `https://registry.npmjs.org/`。改走公司私服就改这一行。

```bash
cd tools/create-jiaorong-app
npm login          # 首次发布，按提示过 2FA
npm version patch  # 改了模板就升版本，npm 不允许覆盖已发版本
npm publish        # 包直接带 app-scaffold/ 源，无同步步骤
```

包直接带 `app-scaffold/` 源码，无同步步骤，零运行时依赖。

用 `pnpm publish` 也行，但本包在 git 仓库的子目录里、分支通常不是 main，需要加 `--no-git-checks`。

发布后国内走 npmmirror 有同步延迟，急用可以显式指定源：

```bash
npm create jiaorong-app@latest --registry=https://registry.npmjs.org
```

包名 `create-jiaorong-app` 对应 `npm create jiaorong-app`、`pnpm create jiaorong-app` 与 `npx create-jiaorong-app` 三种调用方式。
