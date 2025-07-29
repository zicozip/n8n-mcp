import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswTestServer, n8nApiMock, testDataBuilders } from './setup/msw-test-server';
import { useHandlers } from '../setup/msw-setup';
import axios from 'axios';

describe('MSW Setup Verification', () => {
  const baseUrl = 'http://localhost:5678';

  describe('Global MSW Setup', () => {
    it('should intercept n8n API requests with default handlers', async () => {
      // This uses the global MSW setup from vitest.config.ts
      const response = await axios.get(`${baseUrl}/api/v1/health`);
      
      expect(response.status).toBe(200);
      expect(response.data).toEqual({
        status: 'ok',
        version: '1.103.2',
        features: {
          workflows: true,
          executions: true,
          credentials: true,
          webhooks: true,
        }
      });
    });

    it('should allow custom handlers for specific tests', async () => {
      // Add a custom handler just for this test
      useHandlers(
        http.get('*/api/v1/custom-endpoint', () => {
          return HttpResponse.json({ custom: true });
        })
      );

      const response = await axios.get(`${baseUrl}/api/v1/custom-endpoint`);
      
      expect(response.status).toBe(200);
      expect(response.data).toEqual({ custom: true });
    });

    it('should return mock workflows', async () => {
      const response = await axios.get(`${baseUrl}/api/v1/workflows`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('data');
      expect(Array.isArray(response.data.data)).toBe(true);
      expect(response.data.data.length).toBeGreaterThan(0);
    });
  });

  describe('Integration Test Server', () => {
    let serverStarted = false;
    
    beforeAll(() => {
      // Only start if not already running
      if (!serverStarted) {
        mswTestServer.start({ onUnhandledRequest: 'error' });
        serverStarted = true;
      }
    });

    afterAll(() => {
      if (serverStarted) {
        mswTestServer.stop();
        serverStarted = false;
      }
    });

    it('should handle workflow creation with custom response', async () => {
      mswTestServer.use(
        n8nApiMock.mockWorkflowCreate({
          id: 'custom-workflow-123',
          name: 'Test Workflow from MSW'
        })
      );

      const workflowData = testDataBuilders.workflow({
        name: 'My Test Workflow'
      });

      const response = await axios.post(`${baseUrl}/api/v1/workflows`, workflowData);
      
      expect(response.status).toBe(201);
      expect(response.data.data).toMatchObject({
        id: 'custom-workflow-123',
        name: 'Test Workflow from MSW',
        nodes: workflowData.nodes,
        connections: workflowData.connections
      });
    });

    it('should handle error responses', async () => {
      mswTestServer.use(
        n8nApiMock.mockError('*/api/v1/workflows/missing', {
          status: 404,
          message: 'Workflow not found',
          code: 'NOT_FOUND'
        })
      );

      try {
        await axios.get(`${baseUrl}/api/v1/workflows/missing`);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        expect(error.response.data).toEqual({
          message: 'Workflow not found',
          code: 'NOT_FOUND',
          timestamp: expect.any(String)
        });
      }
    });

    it('should simulate rate limiting', async () => {
      mswTestServer.use(
        n8nApiMock.mockRateLimit('*/api/v1/rate-limited')
      );

      // Make requests up to the limit
      for (let i = 0; i < 5; i++) {
        const response = await axios.get(`${baseUrl}/api/v1/rate-limited`);
        expect(response.status).toBe(200);
      }

      // Next request should be rate limited
      try {
        await axios.get(`${baseUrl}/api/v1/rate-limited`);
        expect.fail('Should have been rate limited');
      } catch (error: any) {
        expect(error.response.status).toBe(429);
        expect(error.response.data.code).toBe('RATE_LIMIT');
        expect(error.response.headers['x-ratelimit-remaining']).toBe('0');
      }
    });

    it('should handle webhook execution', async () => {
      mswTestServer.use(
        n8nApiMock.mockWebhookExecution('test-webhook', {
          processed: true,
          result: 'success'
        })
      );

      const webhookData = { message: 'Test webhook payload' };
      const response = await axios.post(`${baseUrl}/webhook/test-webhook`, webhookData);
      
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        processed: true,
        result: 'success',
        webhookReceived: {
          path: 'test-webhook',
          method: 'POST',
          body: webhookData,
          timestamp: expect.any(String)
        }
      });
    });

    it('should wait for specific requests', async () => {
      const requestPromise = mswTestServer.waitForRequests(2, 3000);
      
      // Make two requests
      await Promise.all([
        axios.get(`${baseUrl}/api/v1/workflows`),
        axios.get(`${baseUrl}/api/v1/executions`)
      ]);

      const requests = await requestPromise;
      expect(requests).toHaveLength(2);
      expect(requests[0].url).toContain('/api/v1/workflows');
      expect(requests[1].url).toContain('/api/v1/executions');
    }, { timeout: 10000 }); // Increase timeout for this specific test

    it('should work with scoped handlers', async () => {
      const result = await mswTestServer.withScope(
        [
          http.get('*/api/v1/scoped', () => {
            return HttpResponse.json({ scoped: true });
          })
        ],
        async () => {
          const response = await axios.get(`${baseUrl}/api/v1/scoped`);
          return response.data;
        }
      );

      expect(result).toEqual({ scoped: true });
      
      // Verify the scoped handler is no longer active
      try {
        await axios.get(`${baseUrl}/api/v1/scoped`);
        expect.fail('Should have returned 501');
      } catch (error: any) {
        expect(error.response.status).toBe(501);
      }
    });
  });

  describe('Factory Functions', () => {
    it('should create workflows using factory', async () => {
      const { workflowFactory } = await import('../mocks/n8n-api/data/workflows');
      
      const simpleWorkflow = workflowFactory.simple('n8n-nodes-base.slack', {
        resource: 'message',
        operation: 'post',
        channel: '#general',
        text: 'Hello from test'
      });

      expect(simpleWorkflow).toMatchObject({
        id: expect.stringMatching(/^workflow_\d+$/),
        name: 'Test Slack Workflow',
        active: true,
        nodes: expect.arrayContaining([
          expect.objectContaining({ type: 'n8n-nodes-base.start' }),
          expect.objectContaining({ 
            type: 'n8n-nodes-base.slack',
            parameters: {
              resource: 'message',
              operation: 'post',
              channel: '#general',
              text: 'Hello from test'
            }
          })
        ])
      });
    });

    it('should create executions using factory', async () => {
      const { executionFactory } = await import('../mocks/n8n-api/data/executions');
      
      const successExecution = executionFactory.success('workflow_123');
      const errorExecution = executionFactory.error('workflow_456', {
        message: 'Connection timeout',
        node: 'http_request_1'
      });

      expect(successExecution).toMatchObject({
        workflowId: 'workflow_123',
        status: 'success',
        mode: 'manual'
      });

      expect(errorExecution).toMatchObject({
        workflowId: 'workflow_456',
        status: 'error',
        error: {
          message: 'Connection timeout',
          node: 'http_request_1'
        }
      });
    });
  });
});