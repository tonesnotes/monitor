import dotenv from 'dotenv'
import { AdminServer } from './adminServer'
import { createRuntimeConfigFromEnv, startRuntime, stopRuntime } from './bootstrap'

dotenv.config()

let shuttingDown = false

async function main(): Promise<void> {
  const config = createRuntimeConfigFromEnv()
  const runtime = await startRuntime(config)
  let adminServer: AdminServer | undefined

  if (config.startTasks) {
    console.log('Monitor background tasks are enabled.')
  } else {
    console.log('Monitor background tasks are disabled. Set MONITOR_START_TASKS=true to enable them.')
  }

  if (config.adminPort) {
    adminServer = new AdminServer(runtime)
    adminServer.start()
  } else {
    console.log('Monitor admin disabled. Set ADMIN_PORT to enable the admin service.')
  }

  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`Received ${signal}, shutting down monitor...`)
    try {
      if (adminServer) await adminServer.close()
      await stopRuntime(runtime)
    } finally {
      process.exit(0)
    }
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
