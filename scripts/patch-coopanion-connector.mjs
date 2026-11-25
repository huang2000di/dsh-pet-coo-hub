/**
 * 给 coopanion-connector-dsh 打「只转任务」补丁。
 *
 * 背景：桌面同伴（Coopanion）把每句气泡都往 DSH 会话里推，闲聊会灌满上下文。
 * 这个补丁让桥只在文本以【任务】/ [TASK] / 任务: 开头时才注入会话。
 *
 * 用法：
 *   node scripts/patch-coopanion-connector.mjs          # 打补丁
 *   node scripts/patch-coopanion-connector.mjs --undo   # 还原
 *   node scripts/patch-coopanion-connector.mjs --check  # 只看状态
 *
 * 环境变量：
 *   DSH_PROFILE_DIR  默认 ~/.dsh/profiles/desktop
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PROFILE = process.env.DSH_PROFILE_DIR ?? join(homedir(), '.dsh', 'profiles', 'desktop')
const FILE = join(PROFILE, 'node_modules', 'coopanion-connector-dsh', 'dist', 'index.cjs')
const BAK = FILE + '.bak-taskfilter'
const MODE = process.argv.includes('--undo') ? 'undo' : process.argv.includes('--check') ? 'check' : 'apply'

if (!existsSync(FILE)) {
  console.log('没找到 coopanion-connector-dsh（未安装时跳过即可）。')
  process.exit(0)
}

const t = readFileSync(FILE, 'utf8')
const patched = t.includes('TASK_ONLY_MARK')

if (MODE === 'check') {
  console.log(patched ? '已打补丁（只转任务）' : '未打补丁（全部转发）')
  process.exit(0)
}

if (MODE === 'undo') {
  if (!existsSync(BAK)) {
    console.log('没有备份，无法还原。')
    process.exit(0)
  }
  copyFileSync(BAK, FILE)
  console.log('已还原原文件。重启 DSH 生效。')
  process.exit(0)
}

if (patched) {
  console.log('已经是补丁状态，跳过。')
  process.exit(0)
}

// 注入点：agent.followup(buildUserMessage(`...（通过桌宠）说：${body}`...))
const needle = 'agent.followup(buildUserMessage('
const at = t.indexOf(needle)
if (at < 0) {
  console.log('找不到注入点（版本可能变了），跳过。')
  process.exit(0)
}

copyFileSync(FILE, BAK)
const guard = `var TASK_ONLY_MARK = /^\\s*(【任务】|\\[TASK\\]|任务[:：])/u;
                if (!TASK_ONLY_MARK.test(String(body || ""))) return null;
                `
const next = t.slice(0, at) + guard + t.slice(at)
writeFileSync(FILE, next, 'utf8')
console.log('已打补丁：桥只转发带【任务】前缀的发言。重启 DSH 生效。')