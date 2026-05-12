import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error('Unhandled error', { message: err.message, stack: err.stack, url: req.url });
  res.status(500).json({ error: err.message || 'Internal server error' });
}

export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  logger.debug(`${req.method} ${req.url}`);
  next();
}
