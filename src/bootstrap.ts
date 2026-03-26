import { PrivateKey, CachedKeyDeriver } from '@bsv/sdk'
import {
  Chaintracks,
  MonitorDaemon,
  MonitorDaemonSetup,
  MonitorStartupTaskMode,
  Services,
  Wallet,
  WalletStorageManager,
  createDefaultNoDbChaintracksOptions,
  sdk
} from '@bsv/wallet-toolbox'

export interface RuntimeConfig {
  chain: sdk.Chain
  mySQLConnection?: string
  adminPort?: number
  adminHost: string
  adminRootKeyHex?: string
  adminIdentityKeys: string[]
  startTasks: boolean
  startupTaskMode: MonitorStartupTaskMode
  servicesOptions: ReturnType<typeof Services.createDefaultOptions>
  chaintracks: Chaintracks
}

export interface RuntimeContext {
  config: RuntimeConfig
  daemon: MonitorDaemon
  chaintracks: Chaintracks
  authWallet?: Wallet
}

function parseBase64Csv(value?: string): string[] {
  if (!value) return []
  let decoded: string
  try {
    decoded = Buffer.from(value, 'base64').toString('utf8')
  } catch {
    throw new Error('ADMIN_IDENTITY_KEYS must be a base64 encoded string')
  }
  if (!decoded) {
    throw new Error('ADMIN_IDENTITY_KEYS must decode to a non-empty string')
  }
  return decoded
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue
  const normalized = value.trim().toLowerCase()
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

function parseStartupTaskMode(value: string | undefined, defaultValue: MonitorStartupTaskMode): MonitorStartupTaskMode {
  const normalized = (value || defaultValue).trim().toLowerCase()
  switch (normalized) {
    case 'none':
    case 'default':
    case 'multiuser':
    case 'alltoother':
      return normalized
    default:
      throw new Error(`MONITOR_STARTUP_TASK_MODE must be one of none, default, multiuser, alltoother`)
  }
}

function formatKeyPreview(value?: string): string {
  return value ? `${value.slice(0, 20)}...` : '(unset)'
}

function getAdminAuthRootKeyHex(value?: string): string {
  return value || '1'.repeat(64)
}

export function createRuntimeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const {
    CHAIN = 'test',
    TEST_KNEX_DB_CONNECTION,
    MAIN_KNEX_DB_CONNECTION,
    TAAL_API_KEY,
    WHATSONCHAIN_API_KEY,
    BITAILS_API_KEY,
    ADMIN_PORT,
    ADMIN_HOST = '127.0.0.1',
    ADMIN_ROOT_KEY_HEX,
    ADMIN_IDENTITY_KEYS,
    MONITOR_START_TASKS,
    MONITOR_STARTUP_TASK_MODE
  } = env

  const chain = CHAIN as sdk.Chain
  if (chain !== 'test' && chain !== 'main') {
    throw new Error(`.env CHAIN must be set to 'test' or 'main'`)
  }

  const mySQLConnection = chain === 'main' ? MAIN_KNEX_DB_CONNECTION : TEST_KNEX_DB_CONNECTION
  const servicesOptions = Services.createDefaultOptions(chain)

  // TEMPORARY DISABLE GORILLAPOOL ARC
  servicesOptions.arcGorillaPoolUrl = undefined

  if (TAAL_API_KEY) {
    servicesOptions.taalApiKey = TAAL_API_KEY
    servicesOptions.arcConfig.apiKey = TAAL_API_KEY
  }
  if (WHATSONCHAIN_API_KEY) servicesOptions.whatsOnChainApiKey = WHATSONCHAIN_API_KEY
  if (BITAILS_API_KEY) servicesOptions.bitailsApiKey = BITAILS_API_KEY

  console.log(`
API Keys:
TAAL ${formatKeyPreview(servicesOptions.taalApiKey)}
WHATSONCHAIN ${formatKeyPreview(servicesOptions.whatsOnChainApiKey)}
BITAILS ${formatKeyPreview(servicesOptions.bitailsApiKey)}
GORILLAPOOL ARC ${servicesOptions.arcGorillaPoolUrl || '(disabled)'}
`)

  const chaintracksOptions = createDefaultNoDbChaintracksOptions(chain, WHATSONCHAIN_API_KEY, undefined, 32)
  const chaintracks = new Chaintracks(chaintracksOptions)
  servicesOptions.chaintracks = chaintracks

  const adminIdentityKeys = parseBase64Csv(ADMIN_IDENTITY_KEYS)
  const adminPort = ADMIN_PORT ? Number.parseInt(ADMIN_PORT, 10) : undefined
  if (ADMIN_PORT && Number.isNaN(adminPort)) {
    throw new Error(`ADMIN_PORT must be a valid integer`)
  }

  return {
    chain,
    mySQLConnection,
    adminPort,
    adminHost: ADMIN_HOST,
    adminRootKeyHex: ADMIN_ROOT_KEY_HEX,
    adminIdentityKeys,
    startTasks: parseBoolean(MONITOR_START_TASKS, true),
    startupTaskMode: parseStartupTaskMode(MONITOR_STARTUP_TASK_MODE, 'multiuser'),
    servicesOptions,
    chaintracks
  }
}

export async function startRuntime(config: RuntimeConfig): Promise<RuntimeContext> {
  await config.chaintracks.makeAvailable()

  const args: MonitorDaemonSetup = {
    chain: config.chain,
    mySQLConnection: config.mySQLConnection,
    servicesOptions: config.servicesOptions,
    chaintracks: config.chaintracks,
    startupTaskMode: config.startupTaskMode
  }

  const daemon = new MonitorDaemon(args)
  await daemon.createSetup()
  if (config.startTasks) {
    await daemon.start()
  }

  let authWallet: Wallet | undefined
  if (config.adminPort) {
    const rootKey = PrivateKey.fromHex(getAdminAuthRootKeyHex(config.adminRootKeyHex))
    const keyDeriver = new CachedKeyDeriver(rootKey)
    const storage = new WalletStorageManager(keyDeriver.identityKey)
    authWallet = new Wallet({
      chain: config.chain,
      keyDeriver,
      storage,
      services: daemon.setup!.services
    })
  }

  return {
    config,
    daemon,
    chaintracks: config.chaintracks,
    authWallet
  }
}

export async function stopRuntime(context: RuntimeContext): Promise<void> {
  const { daemon, chaintracks } = context
  const setup = daemon.setup

  if (setup?.monitor) {
    setup.monitor.stopTasks()
  }
  if (daemon.doneTasks) {
    await daemon.doneTasks
    daemon.doneTasks = undefined
  }
  if (setup?.monitor) {
    await setup.monitor.destroy()
  }
  if (setup?.storageProvider) {
    await setup.storageProvider.destroy()
  }
  await chaintracks.destroy()
}
