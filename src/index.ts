import { MonitorDaemon, sdk, Services, wait } from '@bsv/wallet-toolbox'
import { WalletServicesOptions } from '@bsv/wallet-toolbox/out/src/sdk';

import dotenv from 'dotenv'
dotenv.config();

const {
  CHAIN = 'test',
  TEST_KNEX_DB_CONNECTION,
  MAIN_KNEX_DB_CONNECTION,
  TAAL_API_KEY,
  WHATSONCHAIN_API_KEY,
  BITAILS_API_KEY
} = process.env

const chain = <sdk.Chain>CHAIN

if (chain !== 'test' && chain !== 'main')
    throw new Error(`.env CHAIN must be set to 'test' or 'main'`)

const mySQLConnection = chain === 'main'
    ? MAIN_KNEX_DB_CONNECTION
    : TEST_KNEX_DB_CONNECTION

// eslint-disable-next-line prefer-const
let stop = false

const servicesOptions = Services.createDefaultOptions(chain)
if (TAAL_API_KEY) {
    servicesOptions.taalApiKey = TAAL_API_KEY
    servicesOptions.arcConfig.apiKey = TAAL_API_KEY
}
if (WHATSONCHAIN_API_KEY) servicesOptions.whatsOnChainApiKey = WHATSONCHAIN_API_KEY;
if (BITAILS_API_KEY) servicesOptions.bitailsApiKey = BITAILS_API_KEY;
console.log(`
API Keys:
TAAL ${servicesOptions.taalApiKey!.slice(0,20)}
WHATSONCHAIN ${servicesOptions.whatsOnChainApiKey!.slice(0,20)}
BITAILS ${servicesOptions.bitailsApiKey!.slice(0,20)}
`)

async function runMonitor() : Promise<void> {

    for (;!stop;) {

        try {
            const d = new MonitorDaemon({ chain, mySQLConnection, servicesOptions })

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
