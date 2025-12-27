// src/price-updater-handler.ts
import { Handler } from 'aws-lambda'
import { updatePricesInDynamo } from './jobs/priceUpdater'

export const handler: Handler = async (event, context) => {
  try {
    console.log('🔄 Scheduled price update started...')
    await updatePricesInDynamo()
    console.log('✅ Scheduled price update completed successfully')
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Price update completed successfully',
        timestamp: new Date().toISOString()
      })
    }
  } catch (error) {
    console.error('❌ Price update failed:', error)
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Price update failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      })
    }
  }
}