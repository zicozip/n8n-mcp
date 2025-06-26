import { z } from 'zod';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

// n8n API configuration schema
const n8nApiConfigSchema = z.object({
  N8N_API_URL: z.string().url().optional(),
  N8N_API_KEY: z.string().min(1).optional(),
  N8N_API_TIMEOUT: z.coerce.number().positive().default(30000),
  N8N_API_MAX_RETRIES: z.coerce.number().positive().default(3),
});

// Parse and validate n8n API configuration
export function loadN8nApiConfig() {
  const result = n8nApiConfigSchema.safeParse(process.env);
  
  if (!result.success) {
    logger.warn('n8n API configuration validation failed:', result.error.format());
    return null;
  }
  
  const config = result.data;
  
  // Check if both URL and API key are provided
  if (!config.N8N_API_URL || !config.N8N_API_KEY) {
    logger.info('n8n API not configured. Management tools will be disabled.');
    return null;
  }
  
  logger.info('n8n API configured successfully', {
    url: config.N8N_API_URL,
    timeout: config.N8N_API_TIMEOUT,
    maxRetries: config.N8N_API_MAX_RETRIES,
  });
  
  return {
    baseUrl: config.N8N_API_URL,
    apiKey: config.N8N_API_KEY,
    timeout: config.N8N_API_TIMEOUT,
    maxRetries: config.N8N_API_MAX_RETRIES,
  };
}

// Export the configuration (null if not configured)
export const n8nApiConfig = loadN8nApiConfig();

// Helper to check if n8n API is configured
export function isN8nApiConfigured(): boolean {
  return n8nApiConfig !== null;
}

// Type export
export type N8nApiConfig = NonNullable<ReturnType<typeof loadN8nApiConfig>>;