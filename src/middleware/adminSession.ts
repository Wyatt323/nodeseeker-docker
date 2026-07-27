import type { MiddlewareHandler } from 'hono';
import { createErrorResponse } from '../utils/helpers';

export const adminSessionMiddleware: MiddlewareHandler = async (c: any, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json(createErrorResponse('请提供有效的认证 token'), 401);
  }

  const sessionId = authHeader.substring(7);
  const authService = c.get('authService');
  const ipAddress = c.req.header('x-forwarded-for') ||
    c.req.header('x-real-ip') ||
    c.env?.CF_CONNECTING_IP ||
    '127.0.0.1';
  const verification = await authService.verifySession(sessionId, ipAddress);
  if (!verification.valid) {
    return c.json(createErrorResponse(verification.message || 'Session 无效'), 401);
  }

  c.set('sessionData', verification.sessionData);
  c.set('jwtPayload', verification.payload);
  await next();
};
