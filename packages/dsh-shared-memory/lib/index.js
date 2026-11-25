/**
 * dsh-shared-memory — 把所有记忆并成一份。
 *
 * 现在有几套各记各的：
 *   - 我（memory-evolve）：~/.dsh/memories/daily/*.md、projects/*\/MEMORY.md
 *   - 桌宠（dsh-pet）：~/.dsh/dsh-pet/memory.json
 *   - 同伴（Coopanion）：session-main.jsonl（pet_say 与她收到的消息）
 *   - 桌宠频道：~/.dsh/dsh-pet-coo-link/memory.jsonl（+ daily.json / facts.json）
 *   - 她的家（dsh-pet-house）：save.json（进度，不入流水）
 *
 * 本插件建立**一份统一日志** ~/.dsh/shared-memory/events.jsonl：
 *   任何一方都能 POST 追加，也能 GET 最近 N 条；
 *   后台定时把上面几个来源的新内容抽进日志（按内容指纹去重）。
 *
 * 这样不管从哪边说话、做家务、聊天，最后都落在同一份记忆里。
 */

import Schema from '@deepseek-ai/schemastery'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'dsh-shared-memory'
export const inject = ['tools']

export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('启用统一记忆'),
  ingestIntervalSec: Schema.number().min(10).max(600).default(60).description('每隔多少秒把各来源的新内容抽进来'),
  recentLimit: Schema.number().min(5).max(200).default(40).description('默认返回最近多少条'),
  includeAgentMemory: Schema.boolean().default(true).description('把 memory-evolve 的日志也纳入'),
  dailySummary: Schema.boolean().default(true).description('每天给 memory-evolve 的项目记忆写一条家人摘要'),
  summaryHour: Schema.number().min(0).max(23).default(23).description('几点生成当日摘要'),
  projectMemoryDir: Schema.string().default('').description('项目记忆目录（留空自动找当前项目的 MEMORY.md）'),
})

const SOURCE_LABEL = {
  agent: '我',
  pet: '桌宠',
  coop: '同伴',
  channel: '桌宠频道',
  house: '她的家',
  user: '主人',
}

export function apply(ctx, config = {}) {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const dataDir = join(home, 'shared-memory')
  try {
    mkdirSync(dataDir, { recursive: true })
  } catch {
    /* ignore */
  }
  const files = {
    events: join(dataDir, 'events.jsonl'),
    seen: join(dataDir, 'seen.json'),
    log: join(dataDir, 'ingest.log'),
    digest: join(dataDir, 'digest.txt'),
  }

  /** 写一份「最近的事」摘要，供别的角色（桌宠）只读注入。 */
  const writeDigest = (events) => {
    try {
      const lines = events
        .filter((e) => !String(e.text ?? '').includes('你们之前聊过'))
        // 同伴/频道的闲聊不喂给桌宠（主人要求：闲聊别流过去）
        .filter((e) => e.source !== 'coop' && e.source !== 'channel')
        .slice(-12)
        .map((e) => '· ' + (e.who ?? '') + '：' + String(e.text ?? '').replace(/\s+/g, ' ').slice(0, 60))
      writeFileSync(files.digest, lines.join('\n') + '\n', 'utf8')
    } catch {
      /* ignore */
    }
  }

  const log = (m) => {
    try {
      appendFileSync(files.log, `[${new Date().toISOString()}] ${m}\n`, 'utf8')
    } catch {
      /* ignore */
    }
  }

  const fp = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 16)

  const loadSeen = () => {
    try {
      return new Set(JSON.parse(readFileSync(files.seen, 'utf8')))
    } catch {
      return new Set()
    }
  }
  const saveSeen = (set) => {
    try {
      writeFileSync(files.seen, JSON.stringify([...set].slice(-8000)), 'utf8')
    } catch {
      /* ignore */
    }
  }

  /** 事件上限；超过就把最老的滚进归档文件，避免 events.jsonl 无限长。 */
  const MAX_EVENTS = 4000
  const ARCHIVE_KEEP = 3000

  /** 清洗：去掉旁白式回顾、压缩空白、截断。返回 '' 表示这条不要。 */
  const sanitize = (text) => {
    let s = String(text ?? '').replace(/\s+/g, ' ').trim()
    if (!s) return ''
    // “（你们之前聊过：…）”这类回顾是二手段子，不入库
    if (s.includes('你们之前聊过')) return ''
    if (/^（主人通知）/.test(s)) return ''
    s = s.replace(/^·\s*/, '')
    return s.slice(0, 300)
  }

  /** 事件太多时滚动归档，返回是否发生了归档。 */
  const rotate = () => {
    try {
      const raw = readFileSync(files.events, 'utf8')
      const lines = raw.split('\n').filter(Boolean)
      if (lines.length <= MAX_EVENTS) return false
      const cut = lines.length - ARCHIVE_KEEP
      const stamp = new Date().toISOString().slice(0, 10)
      const archiveFile = join(dataDir, 'events-' + stamp + '.jsonl')
      appendFileSync(archiveFile, lines.slice(0, cut).join('\n') + '\n', 'utf8')
      writeFileSync(files.events, lines.slice(cut).join('\n') + '\n', 'utf8')
      log(`归档 ${cut} 条到 ${archiveFile}`)
      return true
    } catch (e) {
      log('归档失败：' + String(e?.message ?? e))
      return false
    }
  }

  let lastText = ''
  let lastAt = 0
  const append = (entry) => {
    try {
      const clean = sanitize(entry.text)
      if (!clean) return false
      // 60 秒内完全相同的句子只留一条
      const now = Date.now()
      if (clean === lastText && now - lastAt < 60_000) return false
      lastText = clean
      lastAt = now
      appendFileSync(files.events, JSON.stringify({ ...entry, text: clean }) + '\n', 'utf8')
      return true
    } catch (e) {
      log('写失败：' + String(e?.message ?? e))
      return false
    }
  }

  const readRecent = (limit, opts = {}) => {
    try {
      const lines = readFileSync(files.events, 'utf8').split('\n').filter(Boolean)
      let picked = lines
      const source = String(opts.source ?? '').trim()
      const q = String(opts.q ?? '').trim().toLowerCase()
      if (source || q) {
        picked = lines.filter((l) => {
          try {
            const e = JSON.parse(l)
            if (source && e.source !== source) return false
            if (q && !String(e.text ?? '').toLowerCase().includes(q)) return false
            return true
          } catch {
            return false
          }
        })
      }
      return picked.slice(-limit).map((l) => {
        try {
          return JSON.parse(l)
        } catch {
          return null
        }
      }).filter(Boolean)
    } catch {
      return []
    }
  }

  /* ---------- 各来源的抽取 ---------- */
  const ingest = () => {
    const seen = loadSeen()
    let added = 0
    const push = (source, text, ts, extra = {}) => {
      const clean = sanitize(text)
      if (!clean) return
      const key = fp(source + '|' + clean.slice(0, 120))
      if (seen.has(key)) return
      seen.add(key)
      append({ ts: ts || new Date().toISOString(), source, who: SOURCE_LABEL[source] ?? source, text: clean.slice(0, 400), ...extra })
      added += 1
    }

    // 1) 桌宠频道（最早那份流水）
    try {
      const f = join(home, 'dsh-pet-coo-link', 'memory.jsonl')
      if (existsSync(f)) {
        for (const line of readFileSync(f, 'utf8').split('\n').slice(-120)) {
          if (!line) continue
          try {
            const r = JSON.parse(line)
            push('channel', (r.said ?? '') + (r.reply ? ' → ' + r.reply : ''), r.at)
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }

    // 2) 桌宠的对话记忆
    try {
      const f = join(home, 'dsh-pet', 'memory.json')
      if (existsSync(f)) {
        const j = JSON.parse(readFileSync(f, 'utf8'))
        const msgs = j?.main?.main?.messages ?? []
        for (const m of msgs.slice(-60)) {
          if (!m?.content) continue
          push(m.role === 'assistant' ? 'pet' : 'user', m.content)
        }
      }
    } catch {
      /* ignore */
    }

    // 3) 同伴（Coopanion）的会话
    try {
      const f = join(
        process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
        'Programs',
        'Coopanion',
        'data',
        'home',
        'companion',
        'data',
        'session-main.jsonl',
      )
      if (existsSync(f)) {
        const lines = readFileSync(f, 'utf8').split('\n').slice(-400)
        for (const line of lines) {
          if (!line || !line.includes('pet_say')) continue
          try {
            const rec = JSON.parse(line)
            if (rec?.item?.name !== 'pet_say') continue
            const args = JSON.parse(rec.item.arguments ?? '{}')
            const script = String(args?.script ?? '').trim()
            if (!script || script.includes('主人:') || script.includes('【thinking】')) continue
            push('coop', script, rec?.context?.ts)
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }

    // 4) 我（memory-evolve）的日志
    if (config.includeAgentMemory !== false) {
      try {
        const dir = join(home, 'memories', 'daily')
        if (existsSync(dir)) {
          const f = join(dir, new Date().toISOString().slice(0, 10) + '.md')
          if (existsSync(f)) {
            const lines = readFileSync(f, 'utf8').split('\n')
            for (const line of lines.slice(-60)) {
              const t = line.replace(/^[-*#>\s]+/, '').trim()
              if (t.length > 6) push('agent', t)
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    saveSeen(seen)
    rotate()
    writeDigest(readRecent(14))
    if (added > 0) log(`新增 ${added} 条`)
    return added
  }

  /* ---------- 每天一条家人摘要 ---------- */
  const summaryDir = join(dataDir, 'daily-summary')
  try {
    mkdirSync(summaryDir, { recursive: true })
  } catch {
    /* ignore */
  }

  /** 找 memory-evolve 的项目记忆文件：配置优先，否则挑最近改过的 MEMORY.md。 */
  const findProjectMemory = () => {
    try {
      const configured = String(config.projectMemoryDir ?? '').trim()
      if (configured) {
        const f = join(configured, 'MEMORY.md')
        return existsSync(f) ? f : ''
      }
      const root = join(home, 'memories', 'projects')
      if (!existsSync(root)) return ''
      let best = ''
      let bestAt = 0
      for (const d of readdirSync(root, { withFileTypes: true })) {
        if (!d.isDirectory()) continue
        const f = join(root, d.name, 'MEMORY.md')
        if (!existsSync(f)) continue
        const at = statSync(f).mtimeMs
        if (at > bestAt) {
          bestAt = at
          best = f
        }
      }
      return best
    } catch {
      return ''
    }
  }

  /** 把当天的事件压成 3–5 行（纯规则，不调模型）。 */
  const buildSummary = (day) => {
    const all = readRecent(MAX_EVENTS)
    const today = all.filter((e) => String(e.ts ?? '').startsWith(day))
    if (today.length === 0) return ''
    const by = {}
    for (const e of today) by[e.source] = (by[e.source] ?? 0) + 1
    const label = { pet: '桌宠', coop: '同伴', channel: '频道', agent: '我', user: '主人' }
    const parts = Object.entries(by)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${label[k] ?? k} ${v}`)
      .join(' / ')

    // 从频道/宠物话语里抽几个话题关键词（取句子前 12 字，去重）
    const topics = []
    const seenTopic = new Set()
    for (const e of today.slice(-80)) {
      if (e.source !== 'channel' && e.source !== 'coop') continue
      const full = String(e.text ?? '')
      const head = full.includes('→') ? full.split('→')[0] : full
      let s = head.replace(/^（主动搭话）/, '').replace(/^【[^】]{1,8}】/, '').trim()
      if (s.length < 6 || s.length > 40) continue
      if (/助手|频道|记忆|插件|开关/.test(s)) continue
      const key = s.slice(0, 8)
      if (seenTopic.has(key)) continue
      seenTopic.add(key)
      topics.push({ key, full: s.slice(0, 22) })
      if (topics.length >= 3) break
    }

    const hour = new Date().getHours()
    const channelCount = by.channel ?? 0
    const channelLine = channelCount > 0 ? `他俩在频道聊了 ${channelCount} 轮，都在桌宠对话里，没进会话。` : ""
    return [
      `${day} 家里概况：共 ${today.length} 条（${parts}）。`,
      channelLine,
      topics.length ? `今天聊到：${topics.map((x) => x.full).join('、')}。` : '',
      `家人在线正常，无需处理；细节可查 /shared-memory/recent。`,
    ]
      .filter(Boolean)
      .join(' ')
  }

  /** 写一条到 memory-evolve 的项目记忆（格式与其一致：§ 分隔 + [时间] 正文）。 */
  const writeDailySummary = (force = false) => {
    try {
      const now = new Date()
      const day = now.toISOString().slice(0, 10)
      const stampFile = join(summaryDir, day + '.md')
      if (!force && existsSync(stampFile)) return { ok: true, skipped: 'already' }
      // 到点才生成（除非强制）
      const hour = Number(config.summaryHour ?? 23)
      if (!force && now.getHours() < hour) return { ok: true, skipped: 'too-early' }

      const summary = buildSummary(day)
      if (!summary) return { ok: false, reason: 'empty' }

      writeFileSync(stampFile, summary + '\n', 'utf8')

      const mem = findProjectMemory()
      if (!mem) {
        log('摘要已生成，但没找到项目记忆文件')
        return { ok: true, wrote: false, summary }
      }
      const stamp = now.toTimeString().slice(0, 5)
      appendFileSync(mem, `\n§\n[${day} ${stamp}] （家人日报）${summary}\n`, 'utf8')
      log('已写入家人日报到 ' + mem)
      return { ok: true, wrote: true, summary, file: mem }
    } catch (e) {
      log('写日报失败：' + String(e?.message ?? e))
      return { ok: false, reason: String(e?.message ?? e) }
    }
  }

  /** 启动时补写昨天的日报（如果昨晚没跑）。 */
  const catchUpSummary = () => {
    try {
      const y = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10)
      const stamp = join(summaryDir, y + '.md')
      if (existsSync(stamp)) return
      const all = readRecent(MAX_EVENTS)
      const has = all.some((e) => String(e.ts ?? '').startsWith(y))
      if (!has) return
      const summary = buildSummary(y)
      if (!summary) return
      writeFileSync(stamp, summary + '\n', 'utf8')
      const mem = findProjectMemory()
      if (mem) appendFileSync(mem, '\n§\n[' + y + ' 23:59] （家人日报·补）' + summary + '\n', 'utf8')
      log('已补写 ' + y + ' 的日报')
    } catch (e) {
      log('补写失败：' + String(e?.message ?? e))
    }
  }

  /* ---------- 启动与定时 ---------- */
  ctx.effect(() => {
    if (config.enabled === false) return
    ingest()
    catchUpSummary()
    if (config.dailySummary !== false) {
      const summaryTimer = setInterval(() => {
        try {
          writeDailySummary(false)
        } catch (e) {
          log('日报定时失败：' + String(e?.message ?? e))
        }
      }, 10 * 60 * 1000)
      setTimeout(() => {
        try {
          writeDailySummary(false)
        } catch {
          /* ignore */
        }
      }, 60 * 1000)
      void summaryTimer
    }

    const timer = setInterval(() => {
      try {
        ingest()
      } catch (e) {
        log('抽取失败：' + String(e?.message ?? e))
      }
    }, Math.max(10, Number(config.ingestIntervalSec ?? 60)) * 1000)
    return () => clearInterval(timer)
  }, 'dsh-shared-memory: ingest')

  /* ---------- HTTP ---------- */
  const readBody = (req) =>
    new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', (c) => {
        chunks.push(c)
        if (chunks.reduce((n, b) => n + b.length, 0) > 64 * 1024) reject(new Error('too large'))
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })

  ctx.inject(['webServer'], (webCtx) => {
    const send = (res, code, payload) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(payload))
    }

    const personaPath = join(dataDir, 'persona.md')
    const DEFAULT_PERSONA = '# 我们仨是谁（共享人设）\n\n## 角色\n\n**主人（你）**\n家里的主人。\n\n**桌宠**\n桌面右下角那只，说话软。\n\n**同伴**\n另一间应用里那只，热络、爱反问。\n\n**我**\n在 DSH 里干活的 AI。\n\n## 约定\n1. 不编造隐私\n2. 不清楚就说记不清\n3. 各自保留语气，不模仿对方\n'
    const ensurePersona = () => {
      try {
        if (!existsSync(personaPath)) writeFileSync(personaPath, DEFAULT_PERSONA, 'utf8')
      } catch {
        /* ignore */
      }
    }
    ensurePersona()

    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: '/shared-memory/persona',
          handler: async (req, res) => {
            const sendJson = (code, payload) => {
              res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
              res.end(JSON.stringify(payload))
            }
            if (req.method === 'GET') {
              let text = ''
              try {
                text = readFileSync(personaPath, 'utf8')
              } catch {
                text = DEFAULT_PERSONA
              }
              return sendJson(200, { path: personaPath, text })
            }
            if (req.method !== 'POST') return sendJson(405, { error: 'method not allowed' })
            let body = {}
            try {
              body = JSON.parse(await readBody(req))
            } catch {
              return sendJson(400, { error: 'invalid json' })
            }
            const text = String(body.text ?? '')
            if (text.length > 8000) return sendJson(400, { error: 'too large（上限 8000 字）' })
            try {
              if (existsSync(personaPath)) {
                const bak = personaPath + '.bak-' + Date.now()
                writeFileSync(bak, readFileSync(personaPath), 'utf8')
              }
              writeFileSync(personaPath, text, 'utf8')
              return sendJson(200, { ok: true, path: personaPath, bytes: Buffer.byteLength(text, 'utf8') })
            } catch (e) {
              return sendJson(500, { error: String(e?.message ?? e) })
            }
          },
        }),
      'dsh-shared-memory: persona',
    )

    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: '/shared-memory/daily-summary',
          handler: async (req, res) => {
            const force = String(req.url ?? '').includes('force=1')
            const result = writeDailySummary(force || req.method === 'POST')
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end(JSON.stringify(result))
          },
        }),
      'dsh-shared-memory: daily summary',
    )

    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: '/shared-memory/stats',
          handler: (_req, res) => {
            ingest()
            const all = readRecent(MAX_EVENTS)
            const bySource = {}
            for (const e of all) bySource[e.source] = (bySource[e.source] ?? 0) + 1
            const dayAgo = Date.now() - 24 * 3600 * 1000
            const last24h = all.filter((e) => Date.parse(e.ts) >= dayAgo).length
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end(JSON.stringify({ total: all.length, bySource, last24h, maxEvents: MAX_EVENTS, personaBytes: (() => { try { return statSync(personaPath).size } catch { return 0 } })() }))
          },
        }),
      'dsh-shared-memory: stats',
    )

    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: '/shared-memory/archive',
          handler: (_req, res) => {
            const done = rotate()
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end(JSON.stringify({ archived: done }))
          },
        }),
      'dsh-shared-memory: archive',
    )

    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: '/shared-memory/recent',
          handler: async (req, res) => {
            const url = new URL(req.url ?? '/', 'http://localhost')
            const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? config.recentLimit ?? 40)))
            const source = url.searchParams.get('source') ?? ''
            const q = url.searchParams.get('q') ?? ''
            if (req.method === 'GET') {
              ingest()
              return send(res, 200, { count: limit, events: readRecent(limit, { source, q }) })
            }
            if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
            let body = {}
            try {
              body = JSON.parse(await readBody(req))
            } catch {
              return send(res, 400, { error: 'invalid json' })
            }
            const ok = append({
              ts: new Date().toISOString(),
              source: String(body.source ?? 'agent'),
              who: SOURCE_LABEL[String(body.source ?? 'agent')] ?? String(body.source ?? 'agent'),
              text: String(body.text ?? '').slice(0, 400),
              kind: body.kind ? String(body.kind) : undefined,
            })
            return send(res, ok ? 200 : 500, { ok })
          },
        }),
      'dsh-shared-memory: recent',
    )
  })

  /* ---------- 工具 ---------- */
  const stringOutput = {
    schema: { type: 'string' },
    render: (_a, v) => [{ type: 'text', text: String(v ?? '') }],
  }

  const tools = [
    {
      name: 'memory_recent',
      output: stringOutput,
      description: '读统一记忆（我的记忆 + 桌宠 + 同伴 + 桌宠频道）最近若干条，默认 20 条。',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: '最多几条，默认 20' },
          source: { type: 'string', description: '只看某个来源：agent/pet/coop/channel/user' },
          q: { type: 'string', description: '关键词过滤' },
        },
      },
      async execute(args) {
        ingest()
        const limit = Math.min(200, Math.max(1, Number(args?.limit ?? 20)))
        const events = readRecent(limit, { source: args?.source, q: args?.q })
        return events.map((e) => `[${String(e.ts).slice(11, 19)}] ${e.who ?? e.source}：${e.text}`).join('\n') || '（还没有共享记忆）'
      },
    },
    {
      name: 'memory_append',
      output: stringOutput,
      description: '往统一记忆里写一条（source 可填 agent/pet/coop/user/house）。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '内容' },
          source: { type: 'string', description: '来源，默认 agent' },
        },
        required: ['text'],
      },
      async execute(args) {
        const ok = append({
          ts: new Date().toISOString(),
          source: String(args?.source ?? 'agent'),
          who: SOURCE_LABEL[String(args?.source ?? 'agent')] ?? '我',
          text: String(args?.text ?? '').slice(0, 400),
        })
        return ok ? '已写入统一记忆' : '写入失败'
      },
    },
    {
      name: 'memory_daily_summary',
      output: stringOutput,
      description: '把今天家里的事压成一条摘要，写进项目记忆（家人日报）。先手动跑一次看看效果。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      async execute() {
        ingest()
        const r = writeDailySummary(true)
        return JSON.stringify(r)
      },
    },
    {
      name: 'memory_ingest_now',
      output: stringOutput,
      description: '立刻把各来源（桌宠 / 同伴 / 桌宠频道 / 我的日志）的新内容抽进统一记忆。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      async execute() {
        const n = ingest()
        const total = readRecent(1).length
        return `本次新增 ${n} 条（日志${total ? '可用' : '为空'}）`
      },
    },
  ]

  for (const def of tools) {
    ctx.effect(() => ctx.tools.register(def), 'dsh-shared-memory: ' + def.name)
  }

  log('统一记忆已启动：' + files.events)
}