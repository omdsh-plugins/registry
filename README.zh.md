# omdsh-plugins/registry

[English](README.md) | 中文

每个 [`@omdsh-plugins/omdsh-plughub`][hub] 默认读取的插件清单。一个文件、一次请求，
也是这个账号声明"我推荐哪些插件"的地方。

```
https://raw.githubusercontent.com/omdsh-plugins/registry/HEAD/registry.json
```

这个地址由插件中心的 `upstream` 设置推导而来，而 `upstream` 默认就是
`omdsh-plugins`。所以插件中心装完不需要任何配置，**设置 → 插件 → OMDSH 插件**
里立刻就能看到整个集合。

## 已经有仓库枚举了，为什么还要它

插件中心还有第二个远程源，完全不需要这个文件：它向 GitHub 要这个账号的仓库列表，
再逐个读 `package.json`。那个源永远不会过期，也会一直保留——推一个仓库到账号下，
不管这里有没有列，它都会出现在目录里。

它做不到的是下面这几件，而这正是这个文件存在的理由：

- **一次请求，而不是每个仓库一次。** 匿名枚举每小时限流 60 次，光这个集合就要十几次。
- **表达"推荐什么"。** 枚举只能报告"存在什么"。一个草稿仓库和一个已发布的插件，
  在它眼里长得一模一样。
- **钉住版本。** 插件中心靠"源声明的版本"与"磁盘上的版本"比较来决定要不要提示更新。
  枚举读的是默认分支，所以它声明的是 `HEAD` 上的任何东西；这里的一行声明的是一个发布版本。

两个源按包名合并，这个源比枚举优先。所以列在这里的插件由这个文件描述，没列在这里的
插件依然能从账号里装。但它并不是整个次序的顶端：如果有人配置了 `localSources`，
那些本地检出目录会排在两个远程源之前。完整的优先级是 `local` > `registry` >
`github`——正在改一个插件的人，看到的是自己手上那份，而不是这里的这一行。

## 文件长什么样

```json
{
  "plugins": [
    {
      "name": "@omdsh-plugins/omdsh-shortcuts",
      "repo": "omdsh-plugins/omdsh-shortcuts",
      "version": "0.1.0",
      "description": "Bind a chord to anything the harness can do…",
      "plughub": {
        "displayName": { "": "Shortcuts", "zh": "快捷键" },
        "summary": { "": "One chord per command…", "zh": "为每个命令绑定一个快捷键…" },
        "category": "input",
        "settings": ["omdsh-shortcuts"],
        "docs": "https://github.com/omdsh-plugins/omdsh-shortcuts#readme",
        "order": 10
      }
    }
  ]
}
```

裸数组也可以。必填的只有 `name` 和一个能安装的来源，其余都是卡片上的装饰。

| 字段 | 含义 |
|---|---|
| `name` | 包名。所有源按它合并 |
| `repo` | `owner/repo`。卡片上的链接；省略 `spec` 时也是安装来源 |
| `spec` | 传给 `pnpm add` 的参数。省略时为 `github:<repo>` |
| `version` | 这一行声明的版本。比已装版本新时才提示更新 |
| `description` | `plughub.summary` 缺席时的兜底简介 |
| `plughub` | 与插件自己 `package.json` 里那一段完全相同 |

行的顺序就是插件中心排卡片的顺序：`plughub.order` 升序，相同时按包名。所以想把一个
插件在面板里往上挪，改的是它自己 `package.json` 里的 `order` 再重新生成，而不是挪
这个文件里的某一行。

一行写坏只损失这一行——插件中心会丢掉它，清单其余部分照常生效。同一个包名出现两次
则损失后出现的那一行：先出现的赢，这样"重复"这个错误就不会让整个目录取决于它恰好写
在文件的哪个位置。

### 一行不能做什么

`spec` 是传给 `pnpm` 的参数，而这个文件对任何一台机器来说都是远程内容。所以插件中心
在执行前会用白名单校验每个 specifier：registry 包名、`github:owner/repo`，或 `https`
的 git / tarball 地址。开头的 `-`、空白字符，以及**任何文件系统路径**都会被拒绝——
远程清单里的路径意味着"装读者机器上碰巧在那个位置的东西"。

## 它是生成的，不是手写的

`build.mjs` 读取集合 checkout 里与本目录并列的插件仓库，从它们的 `package.json`
写出清单。上面每个字段本来就住在那里，手抄一份，只要有人改一句简介就会开始漂移。

哪些包会出现，由包自己决定：一个并列目录声明了 `dsh.bundle.patch` 才会被收进来，这
也正是插件中心判断"可安装"所依据的同一个事实。集合里两个应用工作区——`omdsh-desktop`
和 `omdsh-tui`——因此不在这里：它们都不是 profile 层。

扫描只有一层深，只看与本目录并列的那些目录，不往下走。真正把
`@omdsh-plugins/omdsh-tui-app`（嵌在 `omdsh-tui/packages/tui-app` 里的界面包）挡在
外面的就是这一点：它确实声明了 bundle patch，按上面那条规则本该被收进来，但生成脚本
根本没有走到那么深去读它。它本来也不该被列出来——一个 profile 只组装一个界面，而它
与 web 应用在注册的 id 上冲突，所以它是靠搭一个 TUI profile 装进去的，不是往运行中的
web profile 里加插件。扫描深度是机制，界面互斥才是理由。

## 发布新版本时

1. 发布插件本身——改 `version`，推仓库。
2. 在集合里重跑生成脚本，推这个仓库。

在第 2 步之前，插件中心会认为该插件已是最新：它比较的是这个文件声明的版本，一行不动
就永远不会提示更新。这是"策展清单"的代价，也正是那个生成脚本存在的原因。

## 一行从哪里安装

两种答案，按设计决定，而不是按这个包碰巧在不在 npm 上决定。

| | `spec` | 安装时做什么 |
|---|---|---|
| 插件中心 | `"@omdsh-plugins/omdsh-plughub"` | 直接拉发布版，不构建，机器上不需要工具链 |
| 其余全部 | 省略 → `github:<repo>` | clone 仓库，在 `prepare` 里自己构建 |

谁是哪种，由 `build.mjs` 顶部的 `ON_NPM` 集合决定。**里面只有插件中心。** 它是那条引导线——必须从 npm 装，机器才不用先 clone 任何东西就能拿到安装器——其余每一个插件都从 GitHub 装，哪怕它也在 npm 上。`npm publish` 成功的那一刻就把名字加进去，安装按钮就会去拉 registry 上的那一份，而这不是这套集合装它的方式。

目前只有 `@omdsh-plugins/omdsh-plughub` 从 npm 安装。`node registry/build.mjs` 会把这个划分打印出来，所以一次把别的名字划到 npm 那边的重跑，当场就能看见，而不是等一周后有人点了那张卡片才发现。

## 命令

在集合的 checkout 里跑——那里插件仓库与本目录并列：

```sh
pnpm run registry:build     # 重新生成 registry.json
pnpm run check:registry     # 打印数量；过期就报错
```

两条都定义在集合根目录。生成脚本本身也有对应的两种写法，脚本包的就是它们，CI 不装
workspace 也能直接调：

```sh
node registry/build.mjs
node registry/build.mjs --check
```

`--check` 不写任何东西：它把清单渲染出来，与磁盘上的文件比对，然后要么打印当前有多少
个插件，要么以非零退出并说明文件已过期。不带参数的那条才是重写 `registry.json` 的。

## 已知限制

- **一行没有可用的来源就会整行消失。** `repo` 必须形如 `owner/repo`；如果它不是，
  而这一行又没有自己的 `spec`，就没有任何东西可以推导出 specifier，于是插件中心
  会丢掉整行，而不是列出一个装不了的卡片。
- **生成脚本只认自己的账号。** 一个包的 `repository.url` 指向 `omdsh-plugins`
  以外的账号时，会被警告并跳过——指向别人账号的一行，不是这个 upstream 有资格推荐
  的。所以一个还没改写 `repository` 字段的 fork，重新生成出来的是一份悄悄变短的
  清单，每个包只留下一条警告。
- **扫描只有一层深。** 住在嵌套 workspace 里的插件不会被收进来，无论它的 manifest
  声明了什么——见上面关于 `omdsh-tui-app` 的说明。

[hub]: https://github.com/omdsh-plugins/omdsh-plughub#readme
