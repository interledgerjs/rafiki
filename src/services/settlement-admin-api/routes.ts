import createRouter, { Router, Joi } from 'koa-joi-router'
import { create as createSettlement } from './controllers/accountSettlementController'
import { create as sendMessage } from './controllers/accountMessageController'


export function ApiRouter (): Router {
  const router = createRouter()

  router.route({
    method: 'get',
    path: '/health',
    handler: (ctx) => ctx.body = 'Hello World!'
  })

  router.route({
    method: 'post',
    path: '/accounts/:accountId/settlement',
    validate: {
      params: {
        accountId: Joi.string().required()
      },
      body: {
        amount: Joi.string().required(),
        scale: Joi.number().required()
      },
      type: 'json'
    },
    handler: createSettlement
  })

  router.route({
    method: 'post',
    path: '/accounts/:accountId/messages',
    validate: {
      params: {
        accountId: Joi.string().required()
      }
    },
    handler: sendMessage
  })

  return router
}
