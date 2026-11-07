# dsh-full-copy

给 **DSH（DeepSeek Harness）** 用的小插件：每条回复的底部、宿主那排操作按钮（复制 / 点赞 / 分支）**正上方**，多一行「完全复制」。点一下，把这一整回合的**思考 + 正文 + 工具调用摘要**复制成一段 Markdown。

平时只想要正文，截图或手动拼就行；要把它整段带走（贴进笔记、交给别的模型、存档），这个按钮省掉的就是那段拼接。

## 复制出来长什么样

```markdown
## 思考

（这一回合的思考原文，一字不改）

## 正文

（这一回合的全部正文）

## 工具调用

- [read] file_path=src/main.ts, limit=200
- [pwsh] description=跑构建, command=npm run build
```

三段只在**有内容时**才出现：没思考就没有 `## 思考`，没调工具就没有 `## 工具调用`。

## 它故意不复制什么

| 不复制 | 为什么 |
|---|---|
| 工具返回的大段结果 | 会把剪贴板撑到几万字，粘到哪儿都不好用 |
| `old_string` / `new_string` / `content` 这类正文载荷 | 那是代码内容不是调用身份，复制了全是噪音 |
| 图片、附件 | 文字剪贴板装不下 |

## 每个工具行怎么取参数

- 每个工具最多显示 **3 个**关键参数，按"最能说明这次调用在干什么"的顺序挑（`provider` / `root` / `command` / `file_path` 这类优先）
- 单个值截到 **120 字符**，换行压成一行
- 嵌套参数会摊平参与挑选（比如 `input.root` 也能显示出来）

## 小细节

- 点完变「已复制」，2 秒后恢复
- 没有可复制的内容时显示「复制失败」，不会静默
- **历史回复也能复制**——不限于最新那条
- 剪贴板优先用 `navigator.clipboard`，不可用时退回 `document.execCommand('copy')`

## 安装

```bash
git clone https://github.com/WSTKeQing2677/dsh-full-copy.git
```

然后在 DSH 会话里对 AI 说：

```
用 plugin_manager 安装 <克隆下来的绝对路径>
```

装完**按 F5 刷新页面**——这是客户端插件，不刷新看不到。

> 按路径安装只是在 profile 里建一个指向该目录的链接，**别删、别移动那个目录**，否则插件加载不了。

## 关闭

对 AI 说「关掉完全复制」，或在「设置 → 插件」里找到 `full-copy` 禁用。关掉只是这行按钮消失，不影响任何对话行为。

## 兼容性

- 只在 **DSH `0.2.1-rc.5` + Windows + Web UI** 上验证过。
- 依赖 `conversation.chat.turnTail` 插槽及其 props。版本一变可能失效——它是纯 UI 插件，失效的最坏结果是**按钮不显示**，不影响聊天。
- 宿主那排操作按钮是自绘的、没有可插入的插槽，所以这个按钮只能加在它**上方**，不能并排。

## 自测

仓库里带一个离线冒烟测试，不联网、不需要 DSH：

```bash
node test/smoke.mjs
```

它检查：模块 id 等于包名、`inject` 里有 `slots`/`locale`、只注册一次到 `conversation.chat.turnTail`、`order` 是 10、中英文字典键集一致。改完代码先跑它，比装上去刷新页面快得多。

## License

MIT，见 [LICENSE](LICENSE)。
