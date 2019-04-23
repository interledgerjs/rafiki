import Express from 'express'
import { log } from '../../../winston'
import { body, param, validationResult } from 'express-validator/check'

const logger = log.child({ component: 'settlement-admin-api:AccountBalanceController' })

export function show (request: Express.Request, response: Express.Response) {
  logger.debug('Received get balance request', { params: request.params })
  const errors = validationResult(request)
  if (!errors.isEmpty()) {
    return response.status(422).json({ errors: errors.mapped() })
  }

  const accountId = request.params.accountId
  const getAccountBalanceService = request.app.locals['getAccountBalance']
  const balanceSummary = getAccountBalanceService(accountId)

  return response.json({
    balance: balanceSummary.balance,
    timestamp: Math.floor(Date.now() / 1000) // epoch in seconds
  })
}
export function update (request: Express.Request, response: Express.Response) {
  logger.debug('Received update balance request', { params: request.params, body: request.body })
  const errors = validationResult(request)
  if (!errors.isEmpty()) {
    return response.status(422).json({ errors: errors.mapped() })
  }

  const accountId = request.params.accountId
  const amountDiff = BigInt(request.body.amountDiff)
  const updateAccountBalanceService = request.app.locals['updateAccountBalance']
  updateAccountBalanceService(accountId, amountDiff)

  response.status(200).end()
}

export function validationRules () {
  return [
    body('amountDiff', 'amountDiff must be a string').exists().isString(),
    param('accountId').exists()
  ]
}
