import Express from 'express'
import { body, param, validationResult } from 'express-validator/check'
export function update (request: Express.Request, response: Express.Response) {
  const errors = validationResult(request)
  if (!errors.isEmpty()) {
    return response.status(422).json({ errors: errors.mapped() })
  }

  const accountId = request.params.accountId
  const thresholds = request.body.thresholds.map((threshold: {label: string, balance: string}) => {
    return {
      label: threshold.label,
      balance: BigInt(threshold.balance)
    }
  })

  const updateAccountThresholdsService = request.app.locals['updateAccountThresholds']
  updateAccountThresholdsService(accountId, thresholds)

  response.status(200).end()
}

export function validationRules () {
  return [
    body('thresholds', 'thresholds must be an array').exists().isArray(),
    body('thresholds.*.label', 'threshold label must be a string').exists().isString(),
    body('thresholds.*.balance', 'threshold balance must be a string').exists().isString(),
    param('accountId').exists()
  ]
}
