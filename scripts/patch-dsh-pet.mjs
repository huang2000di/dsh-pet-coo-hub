/**
 * 给 dsh-pet 打「共享记忆 / 共享人设」注入补丁。
 *
 * 为什么需要：dsh-pet 每次对话只用它自己记忆，本插件把「最近发生的事」和
 * 「几个人是谁」写进它拼提示词的地方，它才能在聊天时知道这些。
 *
 * 特点：
 *  - 幂等：已经打过就跳过；备份一次即可
 *  - 可回滚：--undo 会把备份还原
 *  - 不改 dsh-pet 的行为，只在系统提示词末尾追加两段文字
 *
 * 用法：
 *   node scripts/patch-dsh-pet.mjs            # 打补丁
 *   node scripts/patch-dsh-pet.mjs --undo     # 还原
 *   node scripts/patch-dsh-pet.mjs --check    # 只看状态
 *
 * 环境变量：
 *   DSH_PROFILE_DIR  默认 ~/.dsh/profiles/desktop
 *   DSH_HOME         默认 ~/.dsh
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PROFILE = process.env.DSH_PROFILE_DIR ?? join(homedir(), '.dsh', 'profiles', 'desktop')
const HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const PET_LIB = join(PROFILE, 'node_modules', 'dsh-pet', 'lib')
const FILES = ['app.js', 'index.js', 'standalone.js']
const MODE = process.argv.includes('--undo') ? 'undo' : process.argv.includes('--check') ? 'check' : 'apply'

const DIGEST_PATH = join(HOME, 'shared-memory', 'digest.txt')
const PERSONA_PATH = join(HOME, 'shared-memory', 'persona.md')

/** 在提示词末尾追加的读取函数（一次性插入，读不到就当没有）。 */
const HELPER = `function sharedPersonaDoc() {
	const p = ${JSON.stringify(PERSONA_PATH)};
	try {
		if (!existsSync(p)) return "";
		return readFileSync(p, "utf8").trim().slice(0, 1600);
	} catch { return ""; }
}
function sharedMemoryDigest() {
	const p = ${JSON.stringify(DIGEST_PATH)};
	try {
		if (!existsSync(p)) return "";
		return readFileSync(p, "utf8").trim().slice(0, 1200);
	} catch { return ""; }
}
`

const INJECT_BEFORE = '\treturn lines.join("\\n");'

let changed = 0
let skipped = 0
let missing = 0

for (const name of FILES) {
  const file = join(PET_LIB, name)
  if (!existsSync(file)) {
    console.log(`  跳过（不存在）: ${name}`)
    missing += 1
    continue
  }
  const bak = file + '.bak-sharedmem'
  let t = readFileSync(file, 'utf8')
  const patched = t.includes('sharedMemoryDigest')

  if (MODE === 'check') {
    console.log(`  ${name}: ${patched ? '已打补丁' : '未打补丁'}`)
    continue
  }

  if (MODE === 'undo') {
    if (!existsSync(bak)) {
      console.log(`  无法还原（没有备份）: ${name}`)
      continue
    }
    copyFileSync(bak, file)
    console.log(`  已还原: ${name}`)
    changed += 1
    continue
  }

  if (patched) {
    console.log(`  已是补丁状态: ${name}`)
    skipped += 1
    continue
  }

  // 找一个 composeSystemPrompt 的结尾（不同版本变量名不同，用 return 语句定位）
  const idx = t.indexOf(INJECT_BEFORE)
  if (idx < 0) {
    console.log(`  找不到注入点: ${name}`)
    continue
  }
  if (!existsSync(bak)) copyFileSync(file, bak)

  const inject = `\ttry {
\t\tconst personaDoc = sharedPersonaDoc();
\t\tif (personaDoc) lines.push("【这里的人是谁（背景资料，知道就好，不必照念）】\\n" + personaDoc);
\t} catch {}
\ttry {
\t\tconst digest = sharedMemoryDigest();
\t\tif (digest) lines.push("【最近发生的事（背景资料，知道就好，不必照念）】\\n" + digest);
\t} catch {}
`
  t = t.slice(0, idx) + inject + t.slice(idx)
  // 把 helper 插到第一次出现 composeSystemPrompt 之前
  const fnAt = t.indexOf('function composeSystemPrompt')
  if (fnAt >= 0) t = t.slice(0, fnAt) + HELPER + '\n' + t.slice(fnAt)
  writeFileSync(file, t, 'utf8')
  console.log(`  已打补丁: ${name}`)
  changed += 1
}

console.log(
  MODE === 'check'
    ? `检查完成。`
    : `完成：改动 ${changed} 个，跳过 ${skipped} 个，缺失 ${missing} 个。`,
)
if (MODE === 'apply' && changed > 0) {
  console.log('提示：重启 DSH（或禁用再启用 dsh-pet）后生效。')
}