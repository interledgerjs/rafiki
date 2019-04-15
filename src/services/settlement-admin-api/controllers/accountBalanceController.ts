import Express from 'express'
import { body, param, validationResult } from 'express-validator/check'
export function create (request: Express.Request, response: Express.Response) {
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
