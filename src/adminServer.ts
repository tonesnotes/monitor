import { Transaction } from '@bsv/sdk'
import { Services, sdk } from '@bsv/wallet-toolbox'
import { renderAdminPage } from './adminUi'
import { RuntimeContext } from './bootstrap'

const express = require('express')
const { createAuthMiddleware } = require('@bsv/auth-express-middleware')

type ReqRow = {
  updated_at: Date | string
  req_created_at: Date | string
  tx_created_at?: Date | string
  minutesOld: number
  hoursOld: number
  provenTxReqId: number
  transactionId?: number
  userId?: number
  txid: string
  provenTxId?: number
  reqStatus: string
  txStatus?: string
  satoshis?: number
  attempts: number
  notified: boolean
  history: string
  notify: string
  rawTxHex?: string
  batch?: string
  inputBeefHex?: string
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

function toHex(value?: number[] | Buffer): string | undefined {
  if (!value) return undefined
  if (Buffer.isBuffer(value)) return value.toString('hex')
  return Buffer.from(value).toString('hex')
}

function prettyJson(value?: string): string | undefined {
  if (!value) return undefined
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function parseJson(value?: string): unknown {
  if (!value) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function decodeRawTx(rawTx?: number[]) {
  if (!rawTx) return undefined
  const tx = Transaction.fromBinary(rawTx)
  return {
    txid: tx.id('hex'),
    version: tx.version,
    lockTime: tx.lockTime,
    inputs: tx.inputs.map((input: any, vin: number) => ({
      vin,
      sourceTXID: input.sourceTXID,
      sourceOutputIndex: input.sourceOutputIndex,
      sequence: input.sequence,
      unlockingScriptLength: input.unlockingScript?.toBinary?.().length
    })),
    outputs: tx.outputs.map((output: any, vout: number) => ({
      vout,
      satoshis: Number(output.satoshis),
      lockingScriptHex: output.lockingScript?.toHex?.()
    }))
  }
}

async function getStorage(context: RuntimeContext) {
  const storage = context.daemon.setup?.storageProvider
  if (!storage) throw new Error('Monitor storage provider is not available.')
  return storage
}

async function getKnex(context: RuntimeContext) {
  const storage = await getStorage(context)
  const knex = (storage as any).knex
  if (!knex) throw new Error('Joined admin review requires StorageKnex / MySQL.')
  return knex
}

async function queryReqReview(context: RuntimeContext, query: Record<string, unknown>) {
  const knex = await getKnex(context)
  const status = typeof query.status === 'string' && query.status.trim() ? query.status.trim() : undefined
  const txid = typeof query.txid === 'string' && query.txid.trim() ? query.txid.trim() : undefined
  const batch = typeof query.batch === 'string' && query.batch.trim() ? query.batch.trim() : undefined
  const userId = typeof query.userId === 'string' && query.userId.trim() ? asNumber(query.userId, 0) : undefined
  const minTransactionId = asNumber(query.minTransactionId, 0)
  const limit = Math.min(asNumber(query.limit, 25), 200)
  const offset = Math.max(asNumber(query.offset, 0), 0)

  const base = knex('proven_tx_reqs as r')
    .join('transactions as t', 't.txid', 'r.txid')
    .where('t.transactionId', '>=', minTransactionId)

  if (status) base.andWhere('r.status', status)
  if (txid) base.andWhere('r.txid', txid)
  if (batch) base.andWhere('r.batch', batch)
  if (userId) base.andWhere('t.userId', userId)

  const totalResult = (await base.clone().count({ count: '*' })) as Array<{ count: number | string }>
  const total = Number(totalResult[0]?.count || 0)

  const rows = (await base
    .clone()
    .select([
      'r.updated_at',
      'r.created_at as req_created_at',
      't.created_at as tx_created_at',
      knex.raw('TIMESTAMPDIFF(MINUTE, r.created_at, NOW()) as minutesOld'),
      knex.raw('TIMESTAMPDIFF(HOUR, r.created_at, NOW()) as hoursOld'),
      'r.provenTxReqId',
      't.transactionId',
      't.userId',
      'r.txid',
      'r.provenTxId',
      'r.status as reqStatus',
      't.status as txStatus',
      't.satoshis',
      'r.attempts',
      'r.notified',
      'r.history',
      'r.notify',
      knex.raw('HEX(r.rawTx) as rawTxHex'),
      'r.batch',
      knex.raw('HEX(r.inputBEEF) as inputBeefHex')
    ])
    .orderBy('r.provenTxReqId', 'desc')
    .limit(limit)
    .offset(offset)) as ReqRow[]

  return {
    total,
    rows: rows.map(row => ({
      ...row,
      historyJson: parseJson(row.history),
      notifyJson: parseJson(row.notify),
      historyPretty: prettyJson(row.history),
      notifyPretty: prettyJson(row.notify)
    }))
  }
}

async function getReqDetail(context: RuntimeContext, provenTxReqId: number) {
  const storage = await getStorage(context)
  const req = (await storage.findProvenTxReqs({ partial: { provenTxReqId } }))[0]
  if (!req) throw new Error(`ProvenTxReq ${provenTxReqId} not found`)

  const txs = req.txid
    ? await storage.findTransactions({ partial: { txid: req.txid }, noRawTx: false, orderDescending: true })
    : []

  return {
    req,
    reqHistory: parseJson(req.history),
    reqNotify: parseJson(req.notify),
    rawTxHex: toHex(req.rawTx),
    inputBeefHex: toHex(req.inputBEEF),
    decodedRawTx: decodeRawTx(req.rawTx),
    transactions: txs.map(tx => ({
      ...tx,
      rawTxHex: toHex(tx.rawTx),
      inputBeefHex: toHex(tx.inputBEEF)
    }))
  }
}

async function rebroadcastReq(context: RuntimeContext, provenTxReqId: number, provider: string, requestedBy: string) {
  const storage = await getStorage(context)
  const req = (await storage.findProvenTxReqs({ partial: { provenTxReqId } }))[0]
  if (!req?.rawTx) throw new Error(`ProvenTxReq ${provenTxReqId} is missing rawTx`)

  const services = context.daemon.setup?.services as Services | undefined
  if (!(services instanceof Services)) {
    throw new Error('Manual rebroadcast requires monitor services to be a Services instance.')
  }

  const rawTxHex = toHex(req.rawTx)!
  let result: unknown

  switch (provider) {
    case 'taal':
      result = await services.arcTaal.postRawTx(rawTxHex, [req.txid])
      break
    case 'woc':
      result = await services.whatsonchain.postRawTx(rawTxHex)
      break
    default:
      throw new Error(`Unsupported provider "${provider}". Use "taal" or "woc".`)
  }

  await storage.insertMonitorEvent({
    created_at: new Date(),
    updated_at: new Date(),
    id: 0,
    event: 'AdminRebroadcast',
    details: JSON.stringify({ requestedBy, provider, provenTxReqId, txid: req.txid, result })
  })

  return {
    provider,
    provenTxReqId,
    txid: req.txid,
    rawTxHex,
    result
  }
}

export class AdminServer {
  private app: any
  private server: any

  constructor(private readonly context: RuntimeContext) {
    this.app = express()
    this.setupRoutes()
  }

  private setupRoutes(): void {
    this.app.use(express.json({ limit: '5mb' }))
    this.app.use((req: any, res: any, next: any) => {
      res.header('Access-Control-Allow-Origin', '*')
      res.header('Access-Control-Allow-Headers', '*')
      res.header('Access-Control-Allow-Methods', '*')
      if (req.method === 'OPTIONS') return res.sendStatus(200)
      next()
    })

    this.app.get('/healthz', (_req: any, res: any) => {
      res.json({ ok: true, chain: this.context.config.chain })
    })

    if (!this.context.authWallet || this.context.config.adminIdentityKeys.length === 0) {
      this.app.use((_req: any, res: any) => {
        res.status(503).type('text/plain').send('Admin server requires ADMIN_IDENTITY_KEYS and a running monitor runtime.')
      })
      return
    }

    this.app.use(
      '/admin',
      createAuthMiddleware({
        wallet: this.context.authWallet
      })
    )
    this.app.use('/admin', this.requireAdmin.bind(this))

    this.app.get('/admin', (_req: any, res: any) => {
      res.type('text/html').send(renderAdminPage())
    })

    this.app.get('/admin/api/stats', async (req: any, res: any) => {
      const storage = await getStorage(this.context)
      const stats = await storage.adminStats(req.auth.identityKey)
      const reqsTotal = await storage.countProvenTxReqs({ partial: {} })
      res.json({ requestedBy: req.auth.identityKey, stats: { ...stats, reqsTotal } })
    })

    this.app.get('/admin/api/events', async (req: any, res: any) => {
      const storage = await getStorage(this.context)
      const limit = Math.min(asNumber(req.query.limit, 20), 200)
      const offset = Math.max(asNumber(req.query.offset, 0), 0)
      const event = typeof req.query.event === 'string' && req.query.event.trim() ? req.query.event.trim() : undefined
      const partial = event ? { event } : {}
      const [events, total] = await Promise.all([
        storage.findMonitorEvents({ partial, orderDescending: true, paged: { limit, offset } }),
        storage.countMonitorEvents({ partial })
      ])
      res.json({
        total,
        events: events.map(item => ({
          ...item,
          detailsJson: parseJson(item.details),
          detailsPretty: prettyJson(item.details)
        }))
      })
    })

    this.app.get('/admin/api/tasks', async (_req: any, res: any) => {
      const monitor = this.context.daemon.setup?.monitor
      if (!monitor) throw new Error('Monitor is not available.')
      res.json({
        tasks: [
          ...monitor._tasks.map(task => ({ name: task.name, kind: 'scheduled' })),
          ...monitor._otherTasks.map(task => ({ name: task.name, kind: 'manual' }))
        ]
      })
    })

    this.app.post('/admin/api/tasks/:name/run', async (req: any, res: any) => {
      const monitor = this.context.daemon.setup?.monitor
      const storage = await getStorage(this.context)
      if (!monitor) throw new Error('Monitor is not available.')
      const name = String(req.params.name)
      const log = await monitor.runTask(name)
      await storage.insertMonitorEvent({
        created_at: new Date(),
        updated_at: new Date(),
        id: 0,
        event: 'AdminTaskRun',
        details: JSON.stringify({ requestedBy: req.auth.identityKey, taskName: name, log })
      })
      res.json({ task: name, log })
    })

    this.app.get('/admin/api/proven-tx-reqs/review', async (req: any, res: any) => {
      res.json(await queryReqReview(this.context, req.query || {}))
    })

    this.app.get('/admin/api/proven-tx-reqs/:id', async (req: any, res: any) => {
      res.json(await getReqDetail(this.context, asNumber(req.params.id, -1)))
    })

    this.app.get('/admin/api/proven-tx-reqs/:id/decode', async (req: any, res: any) => {
      const detail = await getReqDetail(this.context, asNumber(req.params.id, -1))
      res.json({
        provenTxReqId: detail.req.provenTxReqId,
        txid: detail.req.txid,
        rawTxHex: detail.rawTxHex,
        decodedRawTx: detail.decodedRawTx
      })
    })

    this.app.post('/admin/api/proven-tx-reqs/:id/rebroadcast', async (req: any, res: any) => {
      const provider = typeof req.body?.provider === 'string' ? req.body.provider : 'taal'
      res.json(await rebroadcastReq(this.context, asNumber(req.params.id, -1), provider, req.auth.identityKey))
    })

    this.app.use((error: any, _req: any, res: any, _next: any) => {
      const e = sdk.WalletError.fromUnknown(error)
      res.status(500).json({ error: { code: e.code, message: e.message, description: e.description } })
    })
  }

  private requireAdmin(req: any, _res: any, next: any): void {
    const identityKey = req.auth?.identityKey
    if (!identityKey || !this.context.config.adminIdentityKeys.includes(identityKey)) {
      next(new Error('Authenticated user is not an allowed monitor admin.'))
      return
    }
    next()
  }

  start(): void {
    this.server = this.app.listen(this.context.config.adminPort, this.context.config.adminHost, () => {
      console.log(
        `Monitor admin listening at http://${this.context.config.adminHost}:${this.context.config.adminPort}/admin`
      )
    })
  }

  async close(): Promise<void> {
    if (!this.server) return
    await new Promise<void>(resolve => this.server.close(() => resolve()))
    this.server = undefined
  }
}
