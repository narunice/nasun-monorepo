// src/lambda-handler.ts
import serverlessExpress from '@vendia/serverless-express'
import app from './app-clean'

// Create the serverless express handler
const handler = serverlessExpress({ app })

export { handler }