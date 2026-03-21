export function renderAdminPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Monitor Admin</title>
  <style>
    :root {
      --bg: #f4efe6;
      --panel: #fffaf0;
      --ink: #1f1a14;
      --muted: #6b6257;
      --line: #d9ccb7;
      --accent: #a54b1a;
      --accent-2: #0f766e;
      --warn: #7c2d12;
      --mono: "SFMono-Regular", Menlo, Consolas, monospace;
      --sans: Georgia, "Iowan Old Style", serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at top left, rgba(165, 75, 26, 0.12), transparent 28rem),
        linear-gradient(180deg, #f8f2e9 0%, var(--bg) 100%);
      color: var(--ink);
      font-family: var(--sans);
    }
    main {
      max-width: 1280px;
      margin: 0 auto;
      padding: 24px;
    }
    h1, h2, h3 { margin: 0 0 12px; font-weight: 700; }
    h1 { font-size: 2rem; }
    h2 { font-size: 1.2rem; }
    p, label, button, input, select, table { font-size: 0.95rem; }
    .subtle { color: var(--muted); }
    .grid {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      margin-top: 20px;
    }
    .panel {
      background: rgba(255, 250, 240, 0.92);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      box-shadow: 0 14px 40px rgba(59, 36, 14, 0.08);
      backdrop-filter: blur(12px);
    }
    .stats {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      margin-top: 12px;
    }
    .stat {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 10px 12px;
      background: rgba(255,255,255,0.55);
    }
    .stat .k { display: block; color: var(--muted); font-size: 0.8rem; }
    .stat .v { display: block; font-size: 1.2rem; margin-top: 4px; }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: end;
      margin: 12px 0;
    }
    .toolbar label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 120px;
    }
    input, select, button, textarea {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 8px 10px;
      background: #fffdfa;
      color: var(--ink);
      font-family: inherit;
    }
    button {
      cursor: pointer;
      background: linear-gradient(180deg, #fff7ef, #f2dfca);
    }
    button.primary {
      background: linear-gradient(180deg, #c5622b, var(--accent));
      color: #fff8f2;
      border-color: #8b3f16;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-family: var(--mono);
      font-size: 0.8rem;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      text-align: left;
      padding: 8px 6px;
      vertical-align: top;
    }
    th { color: var(--muted); font-weight: 600; }
    pre {
      overflow: auto;
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px;
      font-family: var(--mono);
      font-size: 0.8rem;
      max-height: 320px;
    }
    details { margin-top: 8px; }
    .event-list {
      display: grid;
      gap: 10px;
      margin-top: 12px;
    }
    .event {
      border-left: 4px solid var(--accent-2);
      padding-left: 10px;
    }
    .row-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .notice {
      margin-top: 12px;
      color: var(--warn);
    }
  </style>
</head>
<body>
  <main>
    <h1>Monitor Admin</h1>
    <p class="subtle">Authenticated operator console for monitor status, event review, req investigation, and targeted task execution.</p>
    <p id="authNotice" class="notice"></p>
    <div class="grid">
      <section class="panel">
        <h2>Stats</h2>
        <div class="toolbar">
          <button id="refreshStats" class="primary">Refresh Stats</button>
        </div>
        <div id="stats" class="stats"></div>
        <pre id="statsRaw"></pre>
      </section>
      <section class="panel">
        <h2>Tasks</h2>
        <div class="toolbar">
          <button id="refreshTasks">Refresh Tasks</button>
        </div>
        <div id="tasks"></div>
        <pre id="taskLog"></pre>
      </section>
    </div>
    <div class="grid">
      <section class="panel">
        <h2>Monitor Events</h2>
        <div class="toolbar">
          <label>Limit<input id="eventsLimit" type="number" value="20" min="1" max="200" /></label>
          <label>Event<input id="eventsName" type="text" placeholder="optional event name" /></label>
          <button id="refreshEvents">Load Events</button>
        </div>
        <div id="events" class="event-list"></div>
      </section>
      <section class="panel">
        <h2>Req Review</h2>
        <div class="toolbar">
          <label>Status<input id="reqStatus" type="text" placeholder="doubleSpend" /></label>
          <label>Txid<input id="reqTxid" type="text" placeholder="exact txid" /></label>
          <label>Min Tx Id<input id="reqMinTransactionId" type="number" value="150000" min="0" /></label>
          <label>Limit<input id="reqLimit" type="number" value="25" min="1" max="200" /></label>
          <button id="refreshReqs" class="primary">Load Review Rows</button>
        </div>
        <div class="subtle" id="reqSummary"></div>
        <div style="overflow:auto">
          <table id="reqTable">
            <thead>
              <tr>
                <th>Req</th>
                <th>Tx</th>
                <th>User</th>
                <th>Req Status</th>
                <th>Tx Status</th>
                <th>Age</th>
                <th>Txid</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
        <pre id="reqDetail"></pre>
      </section>
    </div>
  </main>
  <script>
    const byId = id => document.getElementById(id)

    async function api(path, options) {
      const response = await fetch(path, options)
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || response.statusText)
      }
      return response.json()
    }

    function setNotice(text) {
      byId('authNotice').textContent = text || ''
    }

    function pretty(value) {
      return JSON.stringify(value, null, 2)
    }

    async function loadStats() {
      const result = await api('/admin/api/stats')
      const stats = result.stats || {}
      const target = byId('stats')
      target.innerHTML = ''
      const keys = ['usersTotal', 'transactionsTotal', 'txUnprovenTotal', 'txSendingTotal', 'txFailedTotal', 'reqsTotal']
      keys.forEach(key => {
        const el = document.createElement('div')
        el.className = 'stat'
        el.innerHTML = '<span class="k">' + key + '</span><span class="v">' + (stats[key] ?? '-') + '</span>'
        target.appendChild(el)
      })
      byId('statsRaw').textContent = pretty(result)
      setNotice('Authenticated as ' + result.requestedBy)
    }

    async function loadTasks() {
      const result = await api('/admin/api/tasks')
      const container = byId('tasks')
      container.innerHTML = ''
      result.tasks.forEach(task => {
        const row = document.createElement('div')
        row.className = 'toolbar'
        const button = document.createElement('button')
        button.textContent = 'Run'
        button.onclick = async () => {
          const run = await api('/admin/api/tasks/' + encodeURIComponent(task.name) + '/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          })
          byId('taskLog').textContent = pretty(run)
        }
        row.innerHTML = '<div><strong>' + task.name + '</strong><div class="subtle">' + task.kind + '</div></div>'
        row.appendChild(button)
        container.appendChild(row)
      })
    }

    async function loadEvents() {
      const query = new URLSearchParams()
      query.set('limit', byId('eventsLimit').value || '20')
      const name = byId('eventsName').value.trim()
      if (name) query.set('event', name)
      const result = await api('/admin/api/events?' + query.toString())
      const container = byId('events')
      container.innerHTML = ''
      result.events.forEach(event => {
        const el = document.createElement('div')
        el.className = 'event'
        const details = event.detailsPretty || event.details || ''
        el.innerHTML = '<strong>' + event.event + '</strong><div class="subtle">' + event.created_at + '</div><pre>' + details + '</pre>'
        container.appendChild(el)
      })
    }

    async function loadReqs() {
      const query = new URLSearchParams()
      const status = byId('reqStatus').value.trim()
      const txid = byId('reqTxid').value.trim()
      const minTxId = byId('reqMinTransactionId').value.trim()
      const limit = byId('reqLimit').value.trim()
      if (status) query.set('status', status)
      if (txid) query.set('txid', txid)
      if (minTxId) query.set('minTransactionId', minTxId)
      if (limit) query.set('limit', limit)
      const result = await api('/admin/api/proven-tx-reqs/review?' + query.toString())
      byId('reqSummary').textContent = result.total + ' review rows'
      const body = byId('reqTable').querySelector('tbody')
      body.innerHTML = ''
      result.rows.forEach(row => {
        const tr = document.createElement('tr')
        tr.innerHTML =
          '<td>' + row.provenTxReqId + '</td>' +
          '<td>' + (row.transactionId ?? '') + '</td>' +
          '<td>' + (row.userId ?? '') + '</td>' +
          '<td>' + row.reqStatus + '</td>' +
          '<td>' + (row.txStatus ?? '') + '</td>' +
          '<td>' + row.hoursOld + 'h</td>' +
          '<td>' + row.txid + '</td>'
        const actions = document.createElement('td')
        actions.className = 'row-actions'
        const inspect = document.createElement('button')
        inspect.textContent = 'Inspect'
        inspect.onclick = async () => {
          const detail = await api('/admin/api/proven-tx-reqs/' + row.provenTxReqId)
          byId('reqDetail').textContent = pretty(detail)
        }
        const decode = document.createElement('button')
        decode.textContent = 'Decode'
        decode.onclick = async () => {
          const detail = await api('/admin/api/proven-tx-reqs/' + row.provenTxReqId + '/decode')
          byId('reqDetail').textContent = pretty(detail)
        }
        const rebroadcast = document.createElement('button')
        rebroadcast.textContent = 'Rebroadcast'
        rebroadcast.onclick = async () => {
          const provider = prompt('Provider? Use "taal" or "woc".', 'taal')
          if (!provider) return
          const result = await api('/admin/api/proven-tx-reqs/' + row.provenTxReqId + '/rebroadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider })
          })
          byId('reqDetail').textContent = pretty(result)
        }
        actions.appendChild(inspect)
        actions.appendChild(decode)
        actions.appendChild(rebroadcast)
        tr.appendChild(actions)
        body.appendChild(tr)
      })
    }

    async function init() {
      try {
        await Promise.all([loadStats(), loadTasks(), loadEvents(), loadReqs()])
      } catch (error) {
        setNotice(error.message || String(error))
      }
    }

    byId('refreshStats').onclick = () => loadStats().catch(error => setNotice(error.message || String(error)))
    byId('refreshTasks').onclick = () => loadTasks().catch(error => setNotice(error.message || String(error)))
    byId('refreshEvents').onclick = () => loadEvents().catch(error => setNotice(error.message || String(error)))
    byId('refreshReqs').onclick = () => loadReqs().catch(error => setNotice(error.message || String(error)))

    init()
  </script>
</body>
</html>`
}
