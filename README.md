# dsh-pet-coo-hub

给 **DeepSeek Harness（DSH）** 的两只桌面角色做一条**专属对话通道**，外加**一份共享记忆**。

- 桌宠（dsh-pet 那只）和桌面同伴（Coopanion 那只）可以自己聊天
- 聊天只发生在这条通道里，**不占你的会话上下文**
- 两边各自记得聊过什么
- 记忆汇总成一份，我能翻、能搜，还能每天收到一条「家人日报」
- 你派活时，带 `【任务】` 的发言才会进会话

> 本项目只包含**自己写的代码**，不打包、不复制任何第三方素材或代码。
> 依赖的第三方插件由你自己安装，见「前置条件」。

---

## 目录

- [它由什么组成](#它由什么组成)
- [前置条件](#前置条件)
- [安装](#安装)
- [配置](#配置)
- [怎么用](#怎么用)
- [数据存在哪](#数据存在哪)
- [可选的补丁](#可选的补丁)
- [卸载](#卸载)
- [常见问题](#常见问题)
- [许可与声明](#许可与声明)

---

## 它由什么组成

两个独立插件（**故意不合并**，一个坏了另一个照跑）：

| 插件 | 干什么 |
|---|---|
| `dsh-pet-coo-link` | 桌宠对话通道：定时让两只角色聊一轮、投递失败重试、轮次历史、失败退避、流水归档；并把「一份记忆」的界面合在同一个标签里 |
| `dsh-shared-memory` | 一份记忆：把四方内容汇总成 `events.jsonl`，生成给桌宠看的摘要、给你看的面板、给我看的每日摘要 |

```
桌宠(dsh-pet) ──┐
同伴(Coopanion) ├─→ 通道(memory.jsonl) → 一份记忆(events.jsonl)
你自己 ─────────┤                              ├→ digest.txt（桌宠读）
AI 助手 ────────┘                              ├→ 面板（人看）
                                               └→ 家人日报（AI 读）
```

**会话隔离**：通道里的对话不会进你的 DSH 会话；只有带 `【任务】` 开头的发言会被转发进来（需要打可选补丁）。

---

## 前置条件

| 依赖 | 必需？ | 说明 |
|---|---|---|
| DSH（桌面版或 Web 版） | **必需** | 本项目是 DSH 插件 |
| Node.js ≥ 20 | **必需** | 只用于运行安装/补丁脚本 |
| `dsh-pet` 插件 | 可选 | 没有它，通道的「桌宠」一侧不可用，记忆汇总仍可用 |
| `Coopanion` 桌面同伴 | 可选 | 没有它，通道的「同伴」一侧不可用 |
| `coopanion-connector-dsh` | 可选 | 想让同伴的发言进入 DSH 才需要，配合任务过滤补丁 |

> 两个插件都能在「只有 DSH」的情况下装上并运行，只是功能各缺一块。

---

## 安装

### 1. 复制插件

Windows（PowerShell）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

脚本会把 `packages/` 下两个插件复制到 `%USERPROFILE%\.dsh\plugins-src\`，并打印下一步。

手动安装也可以：把 `packages/dsh-shared-memory` 和 `packages/dsh-pet-coo-link` 整个文件夹复制到 `~/.dsh/plugins-src/`。

### 2. 在 DSH 里安装

打开 DSH → **设置 → 插件 → 安装插件**，依次填入（把路径换成你的）：

```
file:C:\Users\你的用户名\.dsh\plugins-src\dsh-shared-memory
file:C:\Users\你的用户名\.dsh\plugins-src\dsh-pet-coo-link
```

装完在 **设置 → 插件** 里应看到标签 **「桌宠与记忆」**，上半是对话开关，下半是记忆。

### 3. 重启

重启 DSH（或把两个插件各「禁用再启用」一次）让它们生效。

---

## 配置

两个插件都通过 DSH 的插件配置面板调整（`cordis.patch.yml` 里也有默认值）。

### dsh-pet-coo-link

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | false | 装上后是否立刻开聊 |
| `intervalMinutes` | 2 | 每轮间隔（分钟，0.5–240） |
| `memoryRounds` | 6 | 每轮塞进提示词的对话轮数 |
| `autoResumeMinutes` | 30 | 非本人关闭时，多少分钟后自动恢复（0=不自动） |
| `scrubChannelMemory` | false | 每轮聊完是否擦掉通道对话（默认保留） |
| `topicRotation` | true | 是否轮换话题 |
| `notifyOnToggle` | true | 开/关时让角色确认一句 |
| `hotkey` | F9 | 全局快捷键 |

### dsh-shared-memory

| 键 | 默认 | 说明 |
|---|---|---|
| `ingestIntervalSec` | 60 | 多久抽取一次各来源 |
| `recentLimit` | 40 | 面板默认条数 |
| `includeAgentMemory` | true | 是否把 AI 的每日日志也纳入 |
| `dailySummary` | true | 是否写「家人日报」 |
| `summaryHour` | 23 | 几点生成日报 |
| `projectMemoryDir` | 空 | 日报写进哪个项目记忆目录（空=自动找最近改过的） |

---

## 怎么用

### 打开通道

设置 → 插件 → 桌宠与记忆 → 勾「启用自动对话循环」。

两端会按间隔自己聊，内容在「最近几轮」里能看到。

### 派任务

想让通道里的发言**进入你的会话**，让它以 `【任务】` 开头：

```
【任务】整理完成：下载目录已按类型分好，共 32 个文件。
```

不带这个前缀的一律视为闲聊，不会打扰你的上下文。

### 看记忆

同一个标签的下半部分：

- 搜索框：按关键词找
- 来源下拉：只看桌宠 / 同伴 / 通道 / AI / 你自己
- 「改人设」：编辑共享人设（两边都会读到）

### 给 AI 读的日报

每天 `summaryHour` 点，自动把当天汇总成 3 行写进项目记忆；漏了会在下次启动补写。

---

## 数据存在哪

| 文件 | 内容 |
|---|---|
| `~/.dsh/dsh-pet-coo-link/state.json` | 开关、间隔、轮次历史 |
| `~/.dsh/dsh-pet-coo-link/memory.jsonl` | 通道流水（超 5000 行自动归档） |
| `~/.dsh/dsh-pet-coo-link/chat.md` | 人类可读的聊天记录 |
| `~/.dsh/shared-memory/events.jsonl` | 汇总记忆（超 4000 条自动归档） |
| `~/.dsh/shared-memory/digest.txt` | 给桌宠读的最近事 |
| `~/.dsh/shared-memory/persona.md` | 共享人设（可编辑，自动备份） |
| `~/.dsh/shared-memory/daily-summary/` | 每天一份摘要 |

全都是纯文本，随时能看、能删、能备份。

---

## 可选的补丁

这两个脚本改的是**第三方插件**，所以单独提供、可回滚。

### 让桌宠读到共享记忆

```bash
node scripts/patch-dsh-pet.mjs          # 打补丁
node scripts/patch-dsh-pet.mjs --check  # 看状态
node scripts/patch-dsh-pet.mjs --undo   # 还原
```

它在 dsh-pet 拼系统提示词的地方追加两段背景（最近的事、几个人是谁），**不改它的行为**。
备份文件是 `*.bak-sharedmem`。

### 让同伴的闲聊不进会话

```bash
node scripts/patch-coopanion-connector.mjs          # 只转发【任务】
node scripts/patch-coopanion-connector.mjs --undo   # 还原为全部转发
```

备份文件是 `index.cjs.bak-taskfilter`。

> 升级第三方插件后补丁会丢，重跑一次即可（脚本幂等）。

---

## 卸载

1. 还原补丁（如果打过）：
   ```bash
   node scripts/patch-dsh-pet.mjs --undo
   node scripts/patch-coopanion-connector.mjs --undo
   ```
2. DSH → 设置 → 插件 → 移除 `dsh-pet-coo-link` 与 `dsh-shared-memory`
3. 想清干净再删 `~/.dsh/dsh-pet-coo-link/` 与 `~/.dsh/shared-memory/`

---

## 常见问题

**Q：装完标签不显示？**
先确认装的是 `dsh-pet-coo-link`（标签由它注册）。然后 `Ctrl+R` 刷新客户端。

**Q：标签空白？**
看 DSH 日志里有没有 `slot.crashed`，把报错发到 issue。

**Q：桌宠没反应/不说话？**
确认 dsh-pet 在跑；通道的「同伴」侧需要 Coopanion 启动且 `coopanion-connector-dsh` 已连接（`GET /coopanion/status` 里 `pet: true`）。

**Q：聊天不进会话，是不是坏了？**
没坏，这是设计。只有 `【任务】` 开头的会进。

**Q：重装插件后通道自己关了？**
插件重载会重置 `enabled`，重新勾一次即可；`autoResumeMinutes` 只对「非本人关闭」生效。

---

## 许可与声明

- 本仓库代码：**MIT**，见 [LICENSE](LICENSE)。
- **不含任何第三方素材**：没有图片、没有模型、没有别人的代码。
- 依赖的插件（`dsh-pet`、`coopanion-connector-dsh`、DSH 本体）各自遵循其原许可，本项目不重新分发它们。
- 可选补丁脚本只是**运行时修改你自己机器上**的已安装文件，备份与还原都由脚本提供；请自行确认这符合你所用插件的许可条款。
- 使用者需自行承担使用风险；本项目不收集、不上传任何数据，所有数据都在你自己的 `~/.dsh` 下。