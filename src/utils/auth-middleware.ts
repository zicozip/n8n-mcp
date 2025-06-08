import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

/**
 * Express middleware for authenticating requests with Bearer tokens
 */
export function authenticateRequest(authToken?: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!authToken) {
      // No auth required
      return next();
    }

    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
      logger.warn('Missing authorization header', {
        ip: req.ip,
        path: req.path,
      });
      
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing authorization header',
      });
      return;
    }

    // Support both "Bearer TOKEN" and just "TOKEN" formats
    const providedToken = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;
    
    if (providedToken !== authToken) {
      logger.warn('Invalid authentication token', {
        ip: req.ip,
        path: req.path,
      });
      
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid authentication token',
      });
      return;
    }

    next();
  };
}