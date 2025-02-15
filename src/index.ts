import { MonitorDaemon, sdk, wait } from '@bsv/wallet-toolbox'

import dotenv from 'dotenv'
dotenv.config();

const chain = <sdk.Chain>process.env.CHAIN

if (chain !== 'test' && chain !== 'main')
    throw new Error(`.env CHAIN must be set to 'test' or 'main'`)

const mySQLConnection = chain === 'main'
    ? process.env.MAIN_KNEX_DB_CONNECTION
    : process.env.TEST_KNEX_DB_CONNECTION

// eslint-disable-next-line prefer-const
let stop = false

async function runMonitor() : Promise<void> {

    for (;!stop;) {

        try {
            const d = new MonitorDaemon({ chain, mySQLConnection })

            d.runDaemon()

            while (!stop) {
                await wait(10 * 1000)
            }

            console.log("stopping")

            await d.stop()
            
            console.log("cleanup")

            await d.destroy()

            console.log("done")

        } catch (eu: unknown) {
            const e = sdk.WalletError.fromUnknown(eu)
            console.log(`\n\nrunMonitor Main Error Handler\n\ncode: ${e.code}\nDescription: ${e.description}\n\n\n`)
        }
            
    }
}

runMonitor().catch(console.error)
