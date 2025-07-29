import { setupServer } from 'msw/node';
import { HttpResponse, http, RequestHandler } from 'msw';
import { afterAll, afterEach, beforeAll } from 'vitest';

// Import handlers from our centralized location
import { handlers as defaultHandlers } from '../mocks/n8n-api/handlers';

// Create the MSW server instance with default handlers
export const server = setupServer(...defaultHandlers);

// Enable request logging in development/debugging
if (process.env.MSW_DEBUG === 'true' || process.env.TEST_DEBUG === 'true') {
  server.events.on('request:start', ({ request }) => {
    console.log('[MSW] %s %s', request.method, request.url);
  });

  server.events.on('request:match', ({ request }) => {
    console.log('[MSW] Request matched:', request.method, request.url);
  });

  server.events.on('request:unhandled', ({ request }) => {
    console.warn('[MSW] Unhandled request:', request.method, request.url);
  });

  server.events.on('response:mocked', ({ request, response }) => {
    console.log('[MSW] Mocked response for %s %s: %d', 
      request.method, 
      request.url, 
      response.status
    );
  });
}

// Start server before all tests
beforeAll(() => {
  server.listen({
    onUnhandledRequest: process.env.CI === 'true' ? 'error' : 'warn',
  });
});

// Reset handlers after each test (important for test isolation)
afterEach(() => {
  server.resetHandlers();
});

// Clean up after all tests
afterAll(() => {
  server.close();
});

/**
 * Utility function to add temporary handlers for specific tests
 * @param handlers Array of MSW request handlers
 */
export function useHandlers(...handlers: RequestHandler[]) {
  server.use(...handlers);
}

/**
 * Utility to wait for a specific request to be made
 * Useful for testing async operations
 */
export function waitForRequest(method: string, url: string | RegExp): Promise<Request> {
  return new Promise((resolve) => {
    server.events.on('request:match', ({ request }) => {
      if (request.method === method && 
          (typeof url === 'string' ? request.url === url : url.test(request.url))) {
        resolve(request);
      }
    });
  });
}

/**
 * Create a handler factory for common n8n API patterns
 */
export const n8nHandlerFactory = {
  // Workflow endpoints
  workflow: {
    list: (workflows: any[] = []) => 
      http.get('*/api/v1/workflows', () => {
        return HttpResponse.json({ data: workflows, nextCursor: null });
      }),
    
    get: (id: string, workflow: any) =>
      http.get(`*/api/v1/workflows/${id}`, () => {
        return HttpResponse.json({ data: workflow });
      }),
    
    create: () =>
      http.post('*/api/v1/workflows', async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json({ 
          data: { 
            id: 'mock-workflow-id', 
            ...body,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          } 
        });
      }),
    
    update: (id: string) =>
      http.patch(`*/api/v1/workflows/${id}`, async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json({ 
          data: { 
            id, 
            ...body,
            updatedAt: new Date().toISOString()
          } 
        });
      }),
    
    delete: (id: string) =>
      http.delete(`*/api/v1/workflows/${id}`, () => {
        return HttpResponse.json({ success: true });
      }),
  },

  // Execution endpoints
  execution: {
    list: (executions: any[] = []) =>
      http.get('*/api/v1/executions', () => {
        return HttpResponse.json({ data: executions, nextCursor: null });
      }),
    
    get: (id: string, execution: any) =>
      http.get(`*/api/v1/executions/${id}`, () => {
        return HttpResponse.json({ data: execution });
      }),
  },

  // Webhook endpoints
  webhook: {
    trigger: (webhookUrl: string, response: any = { success: true }) =>
      http.all(webhookUrl, () => {
        return HttpResponse.json(response);
      }),
  },

  // Error responses
  error: {
    notFound: (resource: string = 'resource') =>
      HttpResponse.json(
        { message: `${resource} not found`, code: 'NOT_FOUND' },
        { status: 404 }
      ),
    
    unauthorized: () =>
      HttpResponse.json(
        { message: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      ),
    
    serverError: (message: string = 'Internal server error') =>
      HttpResponse.json(
        { message, code: 'INTERNAL_ERROR' },
        { status: 500 }
      ),
    
    validationError: (errors: any) =>
      HttpResponse.json(
        { message: 'Validation failed', errors, code: 'VALIDATION_ERROR' },
        { status: 400 }
      ),
  }
};

// Export for use in tests
export { http, HttpResponse } from 'msw';