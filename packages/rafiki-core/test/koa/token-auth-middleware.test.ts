import { Context } from 'koa'
import { createTokenAuthMiddleware } from "../../src/middleware/token-auth"


describe('Koa: token-auth-middleware', function () {

  test('returns 401 if there is no authorization header', async () => {
    const ctx = {
      request: {
        header: {}
      },
      state: {},
      assert: (value: any, errorCode: number, errorMessage: string) => {
        if (!value) {
          expect(errorCode).toBe(401)
          throw new Error(errorMessage)
        }
      }
    } as Context
    const authMiddleware = createTokenAuthMiddleware(async token => { return { active: true } })

    await expect(authMiddleware(ctx, async () => { return })).rejects.toThrow('Bearer token required in Authorization header')
  })

  test('returns 401 if bearer token is malformed', async () => {
    const ctx = {
      request: {
        header: {
          'authorization': 'Bearer'
        }
      },
      state: {},
      assert: (value: any, errorCode: number, errorMessage: string) => {
        if (!value) {
          expect(errorCode).toBe(401)
          throw new Error(errorMessage)
        }
      }
    } as Context
    const authMiddleware = createTokenAuthMiddleware(async token => { return { active: true } })

    await expect(authMiddleware(ctx, async () => { return })).rejects.toThrow('Bearer token required in Authorization header')
  })

  test('default authentication fails if introspected token is not active', async () => {
    const ctx = {
      request: {
        header: {
          'authorization': 'Bearer asd123'
        }
      },
      state: {},
      assert: (value: any, errorCode: number, errorMessage: string) => {
        if (!value) {
          expect(errorCode).toBe(401)
          throw new Error(errorMessage)
        }
      }
    } as Context
    const authMiddleware = createTokenAuthMiddleware(async token => { return { active: false } })

    await expect(authMiddleware(ctx, async () => { return })).rejects.toThrow('Access Denied - Invalid Token')
  })

  test('returns 401 if introspected token does not have a subject', async () => {
    const ctx = {
      request: {
        header: {
          'authorization': 'Bearer asd123'
        }
      },
      state: {},
      assert: (value: any, errorCode: number, errorMessage: string) => {
        if (!value) {
          expect(errorCode).toBe(401)
          throw new Error(errorMessage)
        }
      }
    } as Context
    const authMiddleware = createTokenAuthMiddleware(async token => { return { active: true } })

    await expect(authMiddleware(ctx, async () => { return })).rejects.toThrow('Access Denied - No Subject in Token')
  })

})