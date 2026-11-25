/**
 * dsh-shared-memory — 浏览器半边：在设置里看「一份记忆」。
 */
window.__ModuleLoader__.load({
  id: 'dsh-shared-memory',
  factory(require) {
    const React = require('react')
    const { useEffect, useState, useCallback } = React

    function MemoryView() {
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

    // 面板已并入「桌宠与记忆」标签（见 dsh-pet-coo-link 客户端），这里不再单独注册。
    return {
      inject: [],
      apply() {},
    }
  },
})