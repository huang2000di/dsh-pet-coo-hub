/**
 * dsh-pet-coo-link — browser half.
 *
 * 只做一件事：在「设置 → 插件」里放一张卡片，用来开关两只桌宠的自动对话。
 * 数据面走宿主端点：
 *   GET  /pet-coo/status          当前状态
 *   POST /pet-coo/toggle {enabled} 开/关
 *
 * 文件是手写的 DSH client module：执行时只注册一个惰性 factory，
 * 真正的副作用都放在 factory 内部，由宿主按需物化。
 */
window.__ModuleLoader__.load({
  id: 'dsh-pet-coo-link',
  factory(require) {
    const React = require('react')
    const { useState, useEffect, useCallback } = React

    const BASE = '/pet-coo'
    const TAB_SLOT = 'settings.plugins.tab'
    const ROW_ID = 'dsh-pet-coo-link'

    const TEXT = {
      tab: '桌宠对话',
      title: '桌宠对话（同伴 × 桌宠）',
      intro: '开启后，每隔一段时间让两只桌宠自己聊一轮；关闭即停。',
      enable: '启用自动对话循环',
      interval: '每隔多少分钟聊一轮',
      hotkey: '快捷键',
      hotkeyHint: '单功能键即可，例如 F9、F10；也可用 Control+Alt+P',
      hotkeySave: '保存快捷键',
      intervalSave: '保存间隔',
      rounds: '记忆轮数',
      recall: '关键词回忆',
      facts: '事实卡',
      memorySave: '保存记忆参数',
      memoryHint: '轮数 0–20；回忆 0–6 条；事实卡 0–20 条（0 表示关闭）',
      memory: '共享记忆',
      last: '最近一句',
      save: '保存',
      saving: '保存中…',
      loading: '读取中…',
      on: '正在聊',
      off: '已停止',
      failed: '操作失败：',
    }

    async function getStatus() {
      const res = await fetch(`${BASE}/status`, { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }

    async function setIntervalMinutes(minutes) {
      const res = await fetch(`${BASE}/interval`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ minutes }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }

    async function setMemory(patch) {
      const res = await fetch(`${BASE}/memory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }

    async function setHotkey(hotkey) {
      const res = await fetch(`${BASE}/hotkey`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hotkey }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }

    async function setEnabled(enabled) {
      const res = await fetch(`${BASE}/toggle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }

    function MemorySection() {
      const [events, setEvents] = useState([])
      const [loading, setLoading] = useState(false)
      const [err, setErr] = useState('')
      const [sourceFilter, setSourceFilter] = useState('')
      const [query, setQuery] = useState('')
      const [stats, setStats] = useState(null)
      const [personaText, setPersonaText] = useState('')
      const [personaPath, setPersonaPath] = useState('')
      const [personaSaved, setPersonaSaved] = useState('')
      const [personaDirty, setPersonaDirty] = useState(false)
      const [showPersona, setShowPersona] = useState(false)

      const loadPersona = useCallback(async () => {
        try {
          const res = await fetch('/shared-memory/persona', { headers: { accept: 'application/json' } })
          const data = await res.json()
          setPersonaText(String(data?.text ?? ''))
          setPersonaPath(String(data?.path ?? ''))
          setPersonaDirty(false)
        } catch (e) {
          setErr(String(e && e.message ? e.message : e))
        }
      }, [])

      const savePersona = useCallback(async () => {
        try {
          const res = await fetch('/shared-memory/persona', {
            method: 'POST',
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ text: personaText }),
          })
          const data = await res.json()
          if (data?.ok) {
            setPersonaSaved(new Date().toLocaleTimeString())
            setPersonaDirty(false)
          } else {
            setErr(String(data?.error ?? '保存失败'))
          }
        } catch (e) {
          setErr(String(e && e.message ? e.message : e))
        }
      }, [personaText])

      const load = useCallback(async () => {
        setLoading(true)
        try {
          const qs = new URLSearchParams({ limit: '80' })
          if (sourceFilter) qs.set('source', sourceFilter)
          if (query.trim()) qs.set('q', query.trim())
          const res = await fetch('/shared-memory/recent?' + qs.toString(), { headers: { accept: 'application/json' } })
          const data = await res.json()
          setEvents(Array.isArray(data?.events) ? data.events : [])
          setErr('')
          try {
            const s = await (await fetch('/shared-memory/stats', { headers: { accept: 'application/json' } })).json()
            setStats(s)
          } catch {
            /* 统计失败不影响列表 */
          }
        } catch (e) {
          setErr(String(e && e.message ? e.message : e))
        } finally {
          setLoading(false)
        }
      }, [sourceFilter, query])

      useEffect(() => {
        load()
        loadPersona()
        const t = setInterval(load, 15000)
        return () => clearInterval(t)
      }, [load, loadPersona])

      const color = {
        我: '#7fb0e8',
        桌宠: '#9fd39a',
        同伴: '#ffd98a',
        桌宠频道: '#c9a0e8',
        主人: '#ff9f9f',
        她的家: '#8fd3d3',
      }

      return React.createElement(
        'div',
        { style: { padding: '2px' } },
        React.createElement(
          'div',
          { style: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' } },
          React.createElement('input', {
            value: query,
            onChange: (e) => setQuery(e.target.value),
            onKeyDown: (e) => {
              if (e.key === 'Enter') load()
            },
            placeholder: '搜关键词…',
            style: { flex: 1, minWidth: 160, padding: '5px 8px', borderRadius: 8, border: '1px solid rgba(128,128,128,.35)', background: 'rgba(255,255,255,.05)', color: 'inherit', fontSize: 13 },
          }),
          React.createElement(
            'select',
            {
              value: sourceFilter,
              onChange: (e) => setSourceFilter(e.target.value),
              style: { padding: '5px 8px', borderRadius: 8, border: '1px solid rgba(128,128,128,.35)', background: 'rgba(255,255,255,.05)', color: 'inherit', fontSize: 13 },
            },
            React.createElement('option', { value: '' }, '全部来源'),
            React.createElement('option', { value: 'pet' }, '桌宠'),
            React.createElement('option', { value: 'coop' }, '同伴'),
            React.createElement('option', { value: 'channel' }, '桌宠频道'),
            React.createElement('option', { value: 'agent' }, '我（助手）'),
            React.createElement('option', { value: 'user' }, '主人'),
          ),
          stats
            ? React.createElement(
                'span',
                { style: { fontSize: 12, opacity: 0.7 } },
                `共 ${stats.total} 条 · 24h 内 ${stats.last24h} 条`,
              )
            : null,
        ),
        React.createElement(
          'div',
          { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 } },
          React.createElement('strong', { style: { fontSize: 15 } }, '一份记忆（所有来源共用）'),
          React.createElement('span', { style: { fontSize: 12.5, opacity: 0.7 } }, `${events.length} 条`),
          React.createElement('span', { style: { flex: 1 } }),
          React.createElement(
            'button',
            {
              onClick: () => {
                setShowPersona((v) => !v)
                if (!showPersona) loadPersona()
              },
              style: { padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(128,128,128,.35)', background: showPersona ? 'rgba(90,150,240,.28)' : 'rgba(255,255,255,.06)', cursor: 'pointer', fontSize: 13 },
            },
            showPersona ? '看记忆' : '改人设',
          ),
          React.createElement(
            'button',
            {
              onClick: load,
              disabled: loading,
              style: { padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(128,128,128,.35)', background: 'rgba(255,255,255,.06)', cursor: 'pointer', fontSize: 13 },
            },
            loading ? '刷新中…' : '刷新',
          ),
        ),
        err ? React.createElement('div', { style: { color: '#ff9f9f', fontSize: 12.5 } }, err) : null,
        showPersona
          ? React.createElement(
              'div',
              { style: { marginBottom: 10 } },
              React.createElement(
                'div',
                { style: { fontSize: 12.5, opacity: 0.75, marginBottom: 6 } },
                '共享人设（桌宠每轮都会读到，保存后下一轮生效）',
                personaPath ? ' · ' + personaPath : '',
                personaSaved ? ' · 已保存 ' + personaSaved : '',
              ),
              React.createElement('textarea', {
                value: personaText,
                onChange: (e) => {
                  setPersonaText(e.target.value)
                  setPersonaDirty(true)
                },
                spellCheck: false,
                style: {
                  width: '100%',
                  minHeight: 260,
                  boxSizing: 'border-box',
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid rgba(128,128,128,.3)',
                  background: 'rgba(255,255,255,.04)',
                  color: 'inherit',
                  fontFamily: 'ui-monospace, Consolas, monospace',
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  resize: 'vertical',
                },
              }),
              React.createElement(
                'div',
                { style: { display: 'flex', gap: 8, marginTop: 6 } },
                React.createElement(
                  'button',
                  {
                    onClick: savePersona,
                    disabled: !personaDirty,
                    style: { padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(128,128,128,.35)', background: personaDirty ? 'rgba(90,150,240,.3)' : 'rgba(255,255,255,.06)', cursor: personaDirty ? 'pointer' : 'default', fontSize: 13 },
                  },
                  personaDirty ? '保存' : '已是最新',
                ),
                React.createElement(
                  'button',
                  {
                    onClick: loadPersona,
                    style: { padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(128,128,128,.35)', background: 'rgba(255,255,255,.06)', cursor: 'pointer', fontSize: 13 },
                  },
                  '放弃修改',
                ),
              ),
            )
          : null,
        React.createElement(
          'div',
          { style: { maxHeight: 520, overflow: 'auto', fontSize: 13, lineHeight: 1.6 } },
          events.length
            ? events
                .slice()
                .reverse()
                .map((e, i) =>
                  React.createElement(
                    'div',
                    { key: i, style: { padding: '4px 0', borderBottom: '1px solid rgba(128,128,128,.12)' } },
                    React.createElement('span', { style: { opacity: 0.55, marginRight: 8, fontSize: 12 } }, String(e.ts ?? '').slice(11, 19)),
                    React.createElement('span', { style: { color: color[e.who] ?? '#bbb', marginRight: 8 } }, e.who ?? e.source),
                    React.createElement('span', null, e.text ?? ''),
                  ),
                )
            : React.createElement('div', { style: { opacity: 0.6 } }, '还没有内容，等一下会自动抽取…'),
        ),
      )
    }

    function PetCooSettings() {
      const t = TEXT
      const [state, setState] = React.useState({ status: 'loading' })
      const [busy, setBusy] = React.useState(false)
      const [hotkeyDraft, setHotkeyDraft] = React.useState('')
      const [minutesDraft, setMinutesDraft] = React.useState('')
      const [roundsDraft, setRoundsDraft] = React.useState('')
      const [recallDraft, setRecallDraft] = React.useState('')
      const [factsDraft, setFactsDraft] = React.useState('')

      const refresh = React.useCallback(() => {
        getStatus()
          .then((data) => {
            setState({ status: 'ready', data })
            // 输入框跟着真实值走，避免显示上一次的草稿。
            setMinutesDraft(String(data?.intervalMinutes ?? ''))
            setRoundsDraft(String(data?.memoryRounds ?? ''))
            setRecallDraft(String(data?.recallLimit ?? ''))
            setFactsDraft(String(data?.factLimit ?? ''))
            setHotkeyDraft(String(data?.hotkey ?? ''))
          })
          .catch((e) => setState({ status: 'error', error: String(e && e.message ? e.message : e) }))
      }, [])

      React.useEffect(() => {
        refresh()
      }, [refresh])

      const toggle = async (next) => {
        setBusy(true)
        try {
          const result = await setEnabled(next)
          setState((prev) => ({ ...prev, data: { ...(prev.data ?? {}), enabled: result.enabled === true } }))
          setTimeout(refresh, 1200)
        } catch (e) {
          setState({ status: 'error', error: String(e && e.message ? e.message : e) })
        } finally {
          setBusy(false)
        }
      }

      const style = {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '4px 2px',
        fontSize: 14,
        lineHeight: 1.6,
      }
      const rowStyle = { display: 'flex', alignItems: 'center', gap: 10 }
      const hintStyle = { opacity: 0.65, fontSize: 13 }

      if (state.status === 'loading') return React.createElement('div', { style }, t.loading)
      if (state.status === 'error') {
        return React.createElement('div', { style }, `${t.failed}${state.error}`)
      }

      const data = state.data ?? {}
      const enabled = data.enabled === true

      return React.createElement(
        'div',
        { style },
        React.createElement('div', { style: { fontWeight: 600, fontSize: 15 } }, t.title),
        React.createElement('div', { style: hintStyle }, t.intro),
        React.createElement(
          'label',
          { style: { ...rowStyle, cursor: busy ? 'default' : 'pointer' } },
          React.createElement('input', {
            type: 'checkbox',
            checked: enabled,
            disabled: busy,
            onChange: (e) => toggle(e.target.checked),
          }),
          React.createElement('span', null, t.enable),
          React.createElement('span', { style: hintStyle }, enabled ? `· ${t.on}` : `· ${t.off}`),
        ),
        React.createElement(
          'div',
          { style: rowStyle },
          React.createElement('span', null, `${t.interval}：`),
          React.createElement('input', {
            type: 'number',
            min: 0.5,
            max: 240,
            step: 0.5,
            value: minutesDraft,
            disabled: busy,
            onChange: (e) => setMinutesDraft(e.target.value),
            style: {
              width: 90,
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid rgba(128,128,128,.4)',
            },
          }),
          React.createElement('span', { style: hintStyle }, '分钟'),
          React.createElement(
            'button',
            {
              type: 'button',
              disabled: busy || !Number(minutesDraft) || String(Number(minutesDraft)) === String(data.intervalMinutes ?? ''),
              onClick: async () => {
                setBusy(true)
                try {
                  const saved = await setIntervalMinutes(Number(minutesDraft))
                  setState((prev) => ({ ...prev, data: { ...(prev.data ?? {}), intervalMinutes: saved.intervalMinutes } }))
                } catch (e) {
                  setState({ status: 'error', error: String(e && e.message ? e.message : e) })
                } finally {
                  setBusy(false)
                }
              },
              style: { padding: '4px 10px', borderRadius: 6, cursor: 'pointer' },
            },
            t.intervalSave,
          ),
        ),
        React.createElement(
          'div',
          { style: hintStyle },
          `${t.memory}：${data.memoryLines ?? 0} 轮已记录`,
        ),
        React.createElement(
          'div',
          { style: rowStyle },
          React.createElement('span', null, `${t.rounds}：`),
          React.createElement('input', {
            type: 'number',
            min: 0,
            max: 20,
            step: 1,
            value: roundsDraft,
            disabled: busy,
            onChange: (e) => setRoundsDraft(e.target.value),
            style: { width: 70, padding: '4px 6px', borderRadius: 6, border: '1px solid rgba(128,128,128,.4)' },
          }),
          React.createElement('span', { style: hintStyle }, '轮　'),
          React.createElement('span', null, `${t.recall}：`),
          React.createElement('input', {
            type: 'number',
            min: 0,
            max: 6,
            step: 1,
            value: recallDraft,
            disabled: busy,
            onChange: (e) => setRecallDraft(e.target.value),
            style: { width: 60, padding: '4px 6px', borderRadius: 6, border: '1px solid rgba(128,128,128,.4)' },
          }),
          React.createElement('span', { style: hintStyle }, '条　'),
          React.createElement('span', null, `${t.facts}：`),
          React.createElement('input', {
            type: 'number',
            min: 0,
            max: 20,
            step: 1,
            value: factsDraft,
            disabled: busy,
            onChange: (e) => setFactsDraft(e.target.value),
            style: { width: 60, padding: '4px 6px', borderRadius: 6, border: '1px solid rgba(128,128,128,.4)' },
          }),
          React.createElement('span', { style: hintStyle }, '条'),
          React.createElement(
            'button',
            {
              type: 'button',
              disabled: busy,
              onClick: async () => {
                setBusy(true)
                try {
                  const saved = await setMemory({
                    rounds: Number(roundsDraft),
                    recall: Number(recallDraft),
                    facts: Number(factsDraft),
                  })
                  setState((prev) => ({
                    ...prev,
                    data: {
                      ...(prev.data ?? {}),
                      memoryRounds: saved.memoryRounds,
                      recallLimit: saved.recallLimit,
                      factLimit: saved.factLimit,
                    },
                  }))
                } catch (e) {
                  setState({ status: 'error', error: String(e && e.message ? e.message : e) })
                } finally {
                  setBusy(false)
                }
              },
              style: { padding: '4px 10px', borderRadius: 6, cursor: 'pointer' },
            },
            t.memorySave,
          ),
        ),
        React.createElement('div', { style: hintStyle }, t.memoryHint),
        React.createElement(
          'div',
          { style: rowStyle },
          React.createElement('span', null, `${t.hotkey}：`),
          React.createElement('input', {
            type: 'text',
            value: hotkeyDraft,
            disabled: busy,
            placeholder: 'F9',
            onChange: (e) => setHotkeyDraft(e.target.value),
            style: {
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid rgba(128,128,128,.4)',
              minWidth: 180,
            },
          }),
          React.createElement(
            'button',
            {
              type: 'button',
              disabled: busy || !hotkeyDraft.trim() || hotkeyDraft.trim() === (data.hotkey ?? ''),
              onClick: async () => {
                setBusy(true)
                try {
                  const saved = await setHotkey(hotkeyDraft.trim())
                  setState((prev) => ({ ...prev, data: { ...(prev.data ?? {}), hotkey: saved.hotkey } }))
                } catch (e) {
                  setState({ status: 'error', error: String(e && e.message ? e.message : e) })
                } finally {
                  setBusy(false)
                }
              },
              style: { padding: '4px 10px', borderRadius: 6, cursor: 'pointer' },
            },
            t.hotkeySave,
          ),
        ),
        React.createElement('div', { style: hintStyle }, t.hotkeyHint),
        data.lastReply
          ? React.createElement('div', { style: hintStyle }, `${t.last}：${String(data.lastReply).slice(0, 80)}`)
          : null,
        // 最近几轮 + 暂停信息（0.5.0 新增）
        (data.rounds ?? []).length
          ? React.createElement(
              'div',
              { style: { ...hintStyle, display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 } },
              React.createElement('div', { style: { fontWeight: 600 } }, '最近几轮：'),
              (data.rounds ?? [])
                .slice(-6)
                .reverse()
                .map((r, i) =>
                  React.createElement(
                    'div',
                    { key: i, style: { opacity: 0.85 } },
                    `${String(r.at ?? '').slice(11, 16)} ${r.kind === 'topic' ? '话题' : '接话'}：${String(r.said ?? '').slice(0, 24)} → ${String(r.reply ?? '').slice(0, 26)}${r.toldOk === false ? '（投递失败）' : ''}`,
                  ),
                ),
            )
          : null,
        data.stopReason && data.stopReason !== 'owner'
          ? React.createElement(
              'div',
              { style: hintStyle },
              `已暂停（${data.stopReason}）；自动恢复：${Number(data.autoResumeMinutes) > 0 ? data.autoResumeMinutes + ' 分钟后' : '不自动'}`,
            )
          : null,
        React.createElement('div', { style: hintStyle }, busy ? t.saving : ''),
      )


    }

    /** 一个入口，两块：桌宠对话 + 一份记忆。 */
    function PetHub() {
      return React.createElement(
        'div',
        null,
        React.createElement('div', { style: { fontSize: 15, fontWeight: 700, margin: '2px 0 8px' } }, '桌宠对话'),
        React.createElement(PetCooSettings, null),
        React.createElement('hr', { style: { border: 0, borderTop: '1px solid rgba(128,128,128,.25)', margin: '18px 0' } }),
        React.createElement('div', { style: { fontSize: 15, fontWeight: 700, margin: '2px 0 8px' } }, '一份记忆（四个来源共用）'),
        React.createElement(MemorySection, null),
      )
    }
    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject(TAB_SLOT, () =>
          ctx.slots.register(
            { name: TAB_SLOT, id: ROW_ID, order: 120, label: () => '桌宠与记忆' },
            PetHub,
          ),
        )
      },
    }
  },
})