import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleCreateWorkflow,
  handleGetWorkflow,
  handleGetWorkflowDetails,
  handleGetWorkflowStructure,
  handleGetWorkflowMinimal,
  handleUpdateWorkflow,
  handleDeleteWorkflow,
  handleListWorkflows,
  handleValidateWorkflow,
  handleTriggerWebhookWorkflow,
  handleGetExecution,
  handleListExecutions,
  handleDeleteExecution,
  handleHealthCheck,
  handleListAvailableTools,
  handleDiagnostic,
  getN8nApiClient,
} from '@/mcp/handlers-n8n-manager';
import { N8nApiClient } from '@/services/n8n-api-client';
import { WorkflowValidator } from '@/services/workflow-validator';
import { NodeRepository } from '@/database/node-repository';
import {
  N8nApiError,
  N8nAuthenticationError,
  N8nNotFoundError,
  N8nValidationError,
  N8nRateLimitError,
  N8nServerError,
} from '@/utils/n8n-errors';
import { ExecutionStatus } from '@/types/n8n-api';
import { z } from 'zod';

// Mock all dependencies
vi.mock('@/services/n8n-api-client');
vi.mock('@/services/workflow-validator');
vi.mock('@/database/node-repository');
vi.mock('@/config/n8n-api');
vi.mock('@/services/n8n-validation');
vi.mock('@/utils/logger');

// Import mocked modules
import { getN8nApiConfig } from '@/config/n8n-api';
import * as n8nValidation from '@/services/n8n-validation';
import { logger } from '@/utils/logger';

describe('handlers-n8n-manager', () => {
  let mockApiClient: any;
  let mockRepository: any;
  let mockValidator: any;

  // Helper function to create test data
  const createTestWorkflow = (overrides = {}) => ({
    id: 'test-workflow-id',
    name: 'Test Workflow',
    active: true,
    nodes: [
      {
        id: 'node1',
        name: 'Start',
        type: 'n8n-nodes-base.start',
        typeVersion: 1,
        position: [100, 100],
        parameters: {},
      },
    ],
    connections: {},
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    tags: [],
    settings: {},
    ...overrides,
  });

  const createTestExecution = (overrides = {}) => ({
    id: 'exec-123',
    workflowId: 'test-workflow-id',
    status: ExecutionStatus.SUCCESS,
    startedAt: '2024-01-01T00:00:00Z',
    stoppedAt: '2024-01-01T00:01:00Z',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock API client
    mockApiClient = {
      createWorkflow: vi.fn(),
      getWorkflow: vi.fn(),
      updateWorkflow: vi.fn(),
      deleteWorkflow: vi.fn(),
      listWorkflows: vi.fn(),
      triggerWebhook: vi.fn(),
      getExecution: vi.fn(),
      listExecutions: vi.fn(),
      deleteExecution: vi.fn(),
      healthCheck: vi.fn(),
    };

    // Setup mock repository
    mockRepository = {
      getNodeByType: vi.fn(),
      getAllNodes: vi.fn(),
    };

    // Setup mock validator
    mockValidator = {
      validateWorkflow: vi.fn(),
    };

    // Mock the API config
    vi.mocked(getN8nApiConfig).mockReturnValue({
      baseUrl: 'https://n8n.test.com',
      apiKey: 'test-key',
      timeout: 30000,
      maxRetries: 3,
    });

    // Mock validation functions
    vi.mocked(n8nValidation.validateWorkflowStructure).mockReturnValue([]);
    vi.mocked(n8nValidation.hasWebhookTrigger).mockReturnValue(false);
    vi.mocked(n8nValidation.getWebhookUrl).mockReturnValue(null);

    // Mock the N8nApiClient constructor
    vi.mocked(N8nApiClient).mockImplementation(() => mockApiClient);

    // Mock WorkflowValidator constructor
    vi.mocked(WorkflowValidator).mockImplementation(() => mockValidator);

    // Mock NodeRepository constructor
    vi.mocked(NodeRepository).mockImplementation(() => mockRepository);
  });

  afterEach(() => {
    // Clear the singleton API client
    const handler = require('../../../src/mcp/handlers-n8n-manager');
    handler.apiClient = null;
    handler.lastConfigUrl = null;
  });

  describe('getN8nApiClient', () => {
    it('should create new client when config is available', () => {
      const client = getN8nApiClient();
      expect(client).toBe(mockApiClient);
      expect(N8nApiClient).toHaveBeenCalledWith({
        baseUrl: 'https://n8n.test.com',
        apiKey: 'test-key',
        timeout: 30000,
        maxRetries: 3,
      });
    });

    it('should return null when config is not available', () => {
      vi.mocked(getN8nApiConfig).mockReturnValue(null);
      const client = getN8nApiClient();
      expect(client).toBeNull();
    });

    it('should reuse existing client when config has not changed', () => {
      const client1 = getN8nApiClient();
      const client2 = getN8nApiClient();
      expect(client1).toBe(client2);
      expect(N8nApiClient).toHaveBeenCalledTimes(1);
    });

    it('should create new client when config URL changes', () => {
      const client1 = getN8nApiClient();
      
      vi.mocked(getN8nApiConfig).mockReturnValue({
        baseUrl: 'https://different.test.com',
        apiKey: 'test-key',
        timeout: 30000,
        maxRetries: 3,
      });
      
      const client2 = getN8nApiClient();
      expect(N8nApiClient).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleCreateWorkflow', () => {
    it('should create workflow successfully', async () => {
      const testWorkflow = createTestWorkflow();
      const input = {
        name: 'Test Workflow',
        nodes: testWorkflow.nodes,
        connections: testWorkflow.connections,
      };

      mockApiClient.createWorkflow.mockResolvedValue(testWorkflow);

      const result = await handleCreateWorkflow(input);

      expect(result).toEqual({
        success: true,
        data: testWorkflow,
        message: 'Workflow "Test Workflow" created successfully with ID: test-workflow-id',
      });
      expect(mockApiClient.createWorkflow).toHaveBeenCalledWith(input);
      expect(n8nValidation.validateWorkflowStructure).toHaveBeenCalledWith(input);
    });

    it('should handle validation errors', async () => {
      const input = { invalid: 'data' };

      const result = await handleCreateWorkflow(input);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
      expect(result.details).toHaveProperty('errors');
    });

    it('should handle workflow structure validation failures', async () => {
      const input = {
        name: 'Test Workflow',
        nodes: [],
        connections: {},
      };

      vi.mocked(n8nValidation.validateWorkflowStructure).mockReturnValue([
        'Workflow must have at least one node',
      ]);

      const result = await handleCreateWorkflow(input);

      expect(result).toEqual({
        success: false,
        error: 'Workflow validation failed',
        details: { errors: ['Workflow must have at least one node'] },
      });
    });

    it('should handle API errors', async () => {
      const input = {
        name: 'Test Workflow',
        nodes: [{ id: 'node1', name: 'Start', type: 'n8n-nodes-base.start' }],
        connections: {},
      };

      const apiError = new N8nValidationError('Invalid workflow data', {
        field: 'nodes',
        message: 'Node configuration invalid',
      });
      mockApiClient.createWorkflow.mockRejectedValue(apiError);

      const result = await handleCreateWorkflow(input);

      expect(result).toEqual({
        success: false,
        error: 'Invalid workflow data',
        code: 'VALIDATION_ERROR',
        details: { field: 'nodes', message: 'Node configuration invalid' },
      });
    });

    it('should handle API not configured error', async () => {
      vi.mocked(getN8nApiConfig).mockReturnValue(null);

      const result = await handleCreateWorkflow({ name: 'Test', nodes: [], connections: {} });

      expect(result).toEqual({
        success: false,
        error: 'n8n API not configured. Please set N8N_API_URL and N8N_API_KEY environment variables.',
      });
    });
  });

  describe('handleGetWorkflow', () => {
    it('should get workflow successfully', async () => {
      const testWorkflow = createTestWorkflow();
      mockApiClient.getWorkflow.mockResolvedValue(testWorkflow);

      const result = await handleGetWorkflow({ id: 'test-workflow-id' });

      expect(result).toEqual({
        success: true,
        data: testWorkflow,
      });
      expect(mockApiClient.getWorkflow).toHaveBeenCalledWith('test-workflow-id');
    });

    it('should handle not found error', async () => {
      const notFoundError = new N8nNotFoundError('Workflow not found');
      mockApiClient.getWorkflow.mockRejectedValue(notFoundError);

      const result = await handleGetWorkflow({ id: 'non-existent' });

      expect(result).toEqual({
        success: false,
        error: 'Workflow not found',
        code: 'NOT_FOUND',
      });
    });

    it('should handle invalid input', async () => {
      const result = await handleGetWorkflow({ notId: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
    });
  });

  describe('handleGetWorkflowDetails', () => {
    it('should get workflow details with execution stats', async () => {
      const testWorkflow = createTestWorkflow();
      const testExecutions = [
        createTestExecution({ status: ExecutionStatus.SUCCESS }),
        createTestExecution({ status: ExecutionStatus.ERROR }),
        createTestExecution({ status: ExecutionStatus.SUCCESS }),
      ];

      mockApiClient.getWorkflow.mockResolvedValue(testWorkflow);
      mockApiClient.listExecutions.mockResolvedValue({
        data: testExecutions,
        nextCursor: null,
      });

      const result = await handleGetWorkflowDetails({ id: 'test-workflow-id' });

      expect(result).toEqual({
        success: true,
        data: {
          workflow: testWorkflow,
          executionStats: {
            totalExecutions: 3,
            successCount: 2,
            errorCount: 1,
            lastExecutionTime: '2024-01-01T00:00:00Z',
          },
          hasWebhookTrigger: false,
          webhookPath: null,
        },
      });
    });

    it('should handle workflow with webhook trigger', async () => {
      const testWorkflow = createTestWorkflow({
        nodes: [
          {
            id: 'webhook1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [100, 100],
            parameters: { path: 'test-webhook' },
          },
        ],
      });

      mockApiClient.getWorkflow.mockResolvedValue(testWorkflow);
      mockApiClient.listExecutions.mockResolvedValue({ data: [], nextCursor: null });
      vi.mocked(n8nValidation.hasWebhookTrigger).mockReturnValue(true);
      vi.mocked(n8nValidation.getWebhookUrl).mockReturnValue('/webhook/test-webhook');

      const result = await handleGetWorkflowDetails({ id: 'test-workflow-id' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('hasWebhookTrigger', true);
      expect(result.data).toHaveProperty('webhookPath', '/webhook/test-webhook');
    });
  });

  describe('handleGetWorkflowStructure', () => {
    it('should return simplified workflow structure', async () => {
      const testWorkflow = createTestWorkflow({
        nodes: [
          {
            id: 'node1',
            name: 'Start',
            type: 'n8n-nodes-base.start',
            typeVersion: 1,
            position: [100, 100],
            parameters: { complex: 'data' },
            disabled: false,
          },
          {
            id: 'node2',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 3,
            position: [300, 100],
            parameters: { url: 'https://api.test.com' },
            disabled: true,
          },
        ],
        connections: {
          node1: {
            main: [[{ node: 'node2', type: 'main', index: 0 }]],
          },
        },
      });

      mockApiClient.getWorkflow.mockResolvedValue(testWorkflow);

      const result = await handleGetWorkflowStructure({ id: 'test-workflow-id' });

      expect(result).toEqual({
        success: true,
        data: {
          id: 'test-workflow-id',
          name: 'Test Workflow',
          active: true,
          nodes: [
            {
              id: 'node1',
              name: 'Start',
              type: 'n8n-nodes-base.start',
              position: [100, 100],
              disabled: false,
            },
            {
              id: 'node2',
              name: 'HTTP Request',
              type: 'n8n-nodes-base.httpRequest',
              position: [300, 100],
              disabled: true,
            },
          ],
          connections: testWorkflow.connections,
          nodeCount: 2,
          connectionCount: 1,
        },
      });
    });
  });

  describe('handleGetWorkflowMinimal', () => {
    it('should return minimal workflow info', async () => {
      const testWorkflow = createTestWorkflow({
        tags: ['automation', 'test'],
      });

      mockApiClient.getWorkflow.mockResolvedValue(testWorkflow);

      const result = await handleGetWorkflowMinimal({ id: 'test-workflow-id' });

      expect(result).toEqual({
        success: true,
        data: {
          id: 'test-workflow-id',
          name: 'Test Workflow',
          active: true,
          tags: ['automation', 'test'],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      });
    });
  });

  describe('handleUpdateWorkflow', () => {
    it('should update workflow successfully', async () => {
      const existingWorkflow = createTestWorkflow();
      const updatedWorkflow = { ...existingWorkflow, name: 'Updated Workflow' };

      mockApiClient.getWorkflow.mockResolvedValue(existingWorkflow);
      mockApiClient.updateWorkflow.mockResolvedValue(updatedWorkflow);

      const result = await handleUpdateWorkflow({
        id: 'test-workflow-id',
        name: 'Updated Workflow',
      });

      expect(result).toEqual({
        success: true,
        data: updatedWorkflow,
        message: 'Workflow "Updated Workflow" updated successfully',
      });
      expect(mockApiClient.updateWorkflow).toHaveBeenCalledWith('test-workflow-id', {
        name: 'Updated Workflow',
      });
    });

    it('should validate structure when updating nodes/connections', async () => {
      const existingWorkflow = createTestWorkflow();
      const newNodes = [
        {
          id: 'node1',
          name: 'New Start',
          type: 'n8n-nodes-base.start',
          typeVersion: 1,
          position: [100, 100],
          parameters: {},
        },
      ];

      mockApiClient.getWorkflow.mockResolvedValue(existingWorkflow);
      mockApiClient.updateWorkflow.mockResolvedValue({
        ...existingWorkflow,
        nodes: newNodes,
      });

      const result = await handleUpdateWorkflow({
        id: 'test-workflow-id',
        nodes: newNodes,
        connections: {},
      });

      expect(result.success).toBe(true);
      expect(n8nValidation.validateWorkflowStructure).toHaveBeenCalledWith({
        nodes: newNodes,
        connections: {},
      });
    });

    it('should handle partial updates with fetching current workflow', async () => {
      const existingWorkflow = createTestWorkflow();
      const newNodes = [{ id: 'new-node', name: 'New Node' }];

      mockApiClient.getWorkflow.mockResolvedValue(existingWorkflow);
      mockApiClient.updateWorkflow.mockResolvedValue({
        ...existingWorkflow,
        nodes: newNodes,
      });

      const result = await handleUpdateWorkflow({
        id: 'test-workflow-id',
        nodes: newNodes,
      });

      expect(result.success).toBe(true);
      expect(mockApiClient.getWorkflow).toHaveBeenCalledWith('test-workflow-id');
      expect(n8nValidation.validateWorkflowStructure).toHaveBeenCalledWith({
        ...existingWorkflow,
        nodes: newNodes,
      });
    });

    it('should handle validation failures', async () => {
      vi.mocked(n8nValidation.validateWorkflowStructure).mockReturnValue([
        'Invalid node configuration',
      ]);

      const result = await handleUpdateWorkflow({
        id: 'test-workflow-id',
        nodes: [],
        connections: {},
      });

      expect(result).toEqual({
        success: false,
        error: 'Workflow validation failed',
        details: { errors: ['Invalid node configuration'] },
      });
    });
  });

  describe('handleDeleteWorkflow', () => {
    it('should delete workflow successfully', async () => {
      mockApiClient.deleteWorkflow.mockResolvedValue(undefined);

      const result = await handleDeleteWorkflow({ id: 'test-workflow-id' });

      expect(result).toEqual({
        success: true,
        message: 'Workflow test-workflow-id deleted successfully',
      });
      expect(mockApiClient.deleteWorkflow).toHaveBeenCalledWith('test-workflow-id');
    });

    it('should handle not found error', async () => {
      const notFoundError = new N8nNotFoundError('Workflow not found');
      mockApiClient.deleteWorkflow.mockRejectedValue(notFoundError);

      const result = await handleDeleteWorkflow({ id: 'non-existent' });

      expect(result).toEqual({
        success: false,
        error: 'Workflow not found',
        code: 'NOT_FOUND',
      });
    });
  });

  describe('handleListWorkflows', () => {
    it('should list workflows with minimal data', async () => {
      const workflows = [
        createTestWorkflow({ id: 'wf1', name: 'Workflow 1', nodes: [{}, {}] }),
        createTestWorkflow({ id: 'wf2', name: 'Workflow 2', active: false, nodes: [{}, {}, {}] }),
      ];

      mockApiClient.listWorkflows.mockResolvedValue({
        data: workflows,
        nextCursor: 'next-page-cursor',
      });

      const result = await handleListWorkflows({
        limit: 50,
        active: true,
      });

      expect(result).toEqual({
        success: true,
        data: {
          workflows: [
            {
              id: 'wf1',
              name: 'Workflow 1',
              active: true,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              tags: [],
              nodeCount: 2,
            },
            {
              id: 'wf2',
              name: 'Workflow 2',
              active: false,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              tags: [],
              nodeCount: 3,
            },
          ],
          returned: 2,
          nextCursor: 'next-page-cursor',
          hasMore: true,
          _note: 'More workflows available. Use cursor to get next page.',
        },
      });
    });

    it('should handle empty workflow list', async () => {
      mockApiClient.listWorkflows.mockResolvedValue({
        data: [],
        nextCursor: null,
      });

      const result = await handleListWorkflows({});

      expect(result.success).toBe(true);
      expect(result.data.workflows).toHaveLength(0);
      expect(result.data.hasMore).toBe(false);
      expect(result.data._note).toBeUndefined();
    });

    it('should use default values for optional parameters', async () => {
      mockApiClient.listWorkflows.mockResolvedValue({
        data: [],
        nextCursor: null,
      });

      await handleListWorkflows({});

      expect(mockApiClient.listWorkflows).toHaveBeenCalledWith({
        limit: 100,
        cursor: undefined,
        active: undefined,
        tags: undefined,
        projectId: undefined,
        excludePinnedData: true,
      });
    });
  });

  describe('handleValidateWorkflow', () => {
    it('should validate workflow from n8n instance', async () => {
      const testWorkflow = createTestWorkflow();
      const mockNodeRepository = new NodeRepository(':memory:');

      mockApiClient.getWorkflow.mockResolvedValue(testWorkflow);
      mockValidator.validateWorkflow.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [
          {
            nodeName: 'node1',
            message: 'Consider using newer version',
            details: { currentVersion: 1, latestVersion: 2 },
          },
        ],
        suggestions: ['Add error handling to workflow'],
        statistics: {
          totalNodes: 1,
          enabledNodes: 1,
          triggerNodes: 1,
          validConnections: 0,
          invalidConnections: 0,
          expressionsValidated: 0,
        },
      });

      const result = await handleValidateWorkflow(
        { id: 'test-workflow-id', options: { validateNodes: true } },
        mockNodeRepository
      );

      expect(result).toEqual({
        success: true,
        data: {
          valid: true,
          workflowId: 'test-workflow-id',
          workflowName: 'Test Workflow',
          summary: {
            totalNodes: 1,
            enabledNodes: 1,
            triggerNodes: 1,
            validConnections: 0,
            invalidConnections: 0,
            expressionsValidated: 0,
            errorCount: 0,
            warningCount: 1,
          },
          warnings: [
            {
              node: 'node1',
              message: 'Consider using newer version',
              details: { currentVersion: 1, latestVersion: 2 },
            },
          ],
          suggestions: ['Add error handling to workflow'],
        },
      });
    });

    it('should handle workflow fetch errors', async () => {
      const notFoundError = new N8nNotFoundError('Workflow not found');
      mockApiClient.getWorkflow.mockRejectedValue(notFoundError);

      const result = await handleValidateWorkflow(
        { id: 'non-existent' },
        new NodeRepository(':memory:')
      );

      expect(result).toEqual({
        success: false,
        error: 'Workflow not found',
        code: 'NOT_FOUND',
      });
    });

    it('should handle validation with errors', async () => {
      const testWorkflow = createTestWorkflow();

      mockApiClient.getWorkflow.mockResolvedValue(testWorkflow);
      mockValidator.validateWorkflow.mockResolvedValue({
        valid: false,
        errors: [
          {
            nodeName: 'node1',
            message: 'Invalid node configuration',
            details: { field: 'parameters.url' },
          },
        ],
        warnings: [],
        suggestions: [],
        statistics: {
          totalNodes: 1,
          enabledNodes: 1,
          triggerNodes: 0,
          validConnections: 0,
          invalidConnections: 0,
          expressionsValidated: 0,
        },
      });

      const result = await handleValidateWorkflow(
        { id: 'test-workflow-id' },
        new NodeRepository(':memory:')
      );

      expect(result.success).toBe(true);
      expect(result.data.valid).toBe(false);
      expect(result.data.errors).toHaveLength(1);
    });
  });

  describe('handleTriggerWebhookWorkflow', () => {
    it('should trigger webhook successfully', async () => {
      const webhookResponse = { executionId: 'exec-123', status: 'success' };
      mockApiClient.triggerWebhook.mockResolvedValue(webhookResponse);

      const result = await handleTriggerWebhookWorkflow({
        webhookUrl: 'https://n8n.test.com/webhook/test-webhook',
        httpMethod: 'POST',
        data: { test: 'data' },
      });

      expect(result).toEqual({
        success: true,
        data: webhookResponse,
        message: 'Webhook triggered successfully',
      });
      expect(mockApiClient.triggerWebhook).toHaveBeenCalledWith({
        webhookUrl: 'https://n8n.test.com/webhook/test-webhook',
        httpMethod: 'POST',
        data: { test: 'data' },
        headers: undefined,
        waitForResponse: true,
      });
    });

    it('should use default values', async () => {
      mockApiClient.triggerWebhook.mockResolvedValue({});

      await handleTriggerWebhookWorkflow({
        webhookUrl: 'https://n8n.test.com/webhook/test',
      });

      expect(mockApiClient.triggerWebhook).toHaveBeenCalledWith({
        webhookUrl: 'https://n8n.test.com/webhook/test',
        httpMethod: 'POST',
        data: undefined,
        headers: undefined,
        waitForResponse: true,
      });
    });

    it('should handle invalid URL', async () => {
      const result = await handleTriggerWebhookWorkflow({
        webhookUrl: 'not-a-valid-url',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
    });
  });

  describe('handleGetExecution', () => {
    it('should get execution successfully', async () => {
      const testExecution = createTestExecution();
      mockApiClient.getExecution.mockResolvedValue(testExecution);

      const result = await handleGetExecution({
        id: 'exec-123',
        includeData: true,
      });

      expect(result).toEqual({
        success: true,
        data: testExecution,
      });
      expect(mockApiClient.getExecution).toHaveBeenCalledWith('exec-123', true);
    });

    it('should default includeData to false', async () => {
      mockApiClient.getExecution.mockResolvedValue({});

      await handleGetExecution({ id: 'exec-123' });

      expect(mockApiClient.getExecution).toHaveBeenCalledWith('exec-123', false);
    });
  });

  describe('handleListExecutions', () => {
    it('should list executions with filters', async () => {
      const executions = [
        createTestExecution({ id: 'exec-1' }),
        createTestExecution({ id: 'exec-2', status: ExecutionStatus.ERROR }),
      ];

      mockApiClient.listExecutions.mockResolvedValue({
        data: executions,
        nextCursor: null,
      });

      const result = await handleListExecutions({
        workflowId: 'test-workflow-id',
        status: 'success',
        limit: 50,
      });

      expect(result).toEqual({
        success: true,
        data: {
          executions,
          returned: 2,
          nextCursor: null,
          hasMore: false,
        },
      });
      expect(mockApiClient.listExecutions).toHaveBeenCalledWith({
        limit: 50,
        cursor: undefined,
        workflowId: 'test-workflow-id',
        projectId: undefined,
        status: ExecutionStatus.SUCCESS,
        includeData: false,
      });
    });

    it('should handle pagination', async () => {
      mockApiClient.listExecutions.mockResolvedValue({
        data: [createTestExecution()],
        nextCursor: 'next-page',
      });

      const result = await handleListExecutions({});

      expect(result.data.hasMore).toBe(true);
      expect(result.data._note).toBe('More executions available. Use cursor to get next page.');
    });
  });

  describe('handleDeleteExecution', () => {
    it('should delete execution successfully', async () => {
      mockApiClient.deleteExecution.mockResolvedValue(undefined);

      const result = await handleDeleteExecution({ id: 'exec-123' });

      expect(result).toEqual({
        success: true,
        message: 'Execution exec-123 deleted successfully',
      });
      expect(mockApiClient.deleteExecution).toHaveBeenCalledWith('exec-123');
    });
  });

  describe('handleHealthCheck', () => {
    it('should check health successfully', async () => {
      const healthData = {
        status: 'ok',
        instanceId: 'n8n-instance-123',
        n8nVersion: '1.0.0',
        features: ['webhooks', 'api'],
      };

      mockApiClient.healthCheck.mockResolvedValue(healthData);

      const result = await handleHealthCheck();

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        status: 'ok',
        instanceId: 'n8n-instance-123',
        n8nVersion: '1.0.0',
        features: ['webhooks', 'api'],
        apiUrl: 'https://n8n.test.com',
      });
    });

    it('should handle API errors', async () => {
      const apiError = new N8nServerError('Service unavailable');
      mockApiClient.healthCheck.mockRejectedValue(apiError);

      const result = await handleHealthCheck();

      expect(result).toEqual({
        success: false,
        error: 'Service unavailable',
        code: 'SERVER_ERROR',
        details: {
          apiUrl: 'https://n8n.test.com',
          hint: 'Check if n8n is running and API is enabled',
        },
      });
    });
  });

  describe('handleListAvailableTools', () => {
    it('should list all available tools when API is configured', async () => {
      const result = await handleListAvailableTools();

      expect(result.success).toBe(true);
      expect(result.data.apiConfigured).toBe(true);
      expect(result.data.tools).toHaveLength(3); // 3 categories
      expect(result.data.configuration).toEqual({
        apiUrl: 'https://n8n.test.com',
        timeout: 30000,
        maxRetries: 3,
      });
    });

    it('should indicate when API is not configured', async () => {
      vi.mocked(getN8nApiConfig).mockReturnValue(null);

      const result = await handleListAvailableTools();

      expect(result.success).toBe(true);
      expect(result.data.apiConfigured).toBe(false);
      expect(result.data.configuration).toBeNull();
    });
  });

  describe('handleDiagnostic', () => {
    it('should provide diagnostic information', async () => {
      const healthData = {
        status: 'ok',
        n8nVersion: '1.0.0',
      };
      mockApiClient.healthCheck.mockResolvedValue(healthData);

      const result = await handlers.handleDiagnostic({ params: { arguments: {} } });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        environment: {
          N8N_API_URL: 'https://n8n.test.com',
          N8N_API_KEY: '***configured***',
        },
        apiConfiguration: {
          configured: true,
          status: {
            configured: true,
            connected: true,
            version: '1.0.0',
          },
        },
        toolsAvailability: {
          documentationTools: {
            count: 22,
            enabled: true,
          },
          managementTools: {
            count: 16,
            enabled: true,
          },
          totalAvailable: 38,
        },
      });
    });

    it('should handle verbose mode', async () => {
      mockApiClient.healthCheck.mockResolvedValue({ status: 'ok' });

      const result = await handleDiagnostic({
        params: { arguments: { verbose: true } },
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('debug');
      expect(result.data.debug).toHaveProperty('nodeVersion');
      expect(result.data.debug).toHaveProperty('platform');
    });

    it('should show troubleshooting steps when API is not configured', async () => {
      vi.mocked(getN8nApiConfig).mockReturnValue(null);

      const result = await handlers.handleDiagnostic({ params: { arguments: {} } });

      expect(result.success).toBe(true);
      expect(result.data.apiConfiguration.configured).toBe(false);
      expect(result.data.toolsAvailability.managementTools.enabled).toBe(false);
      expect(result.data.troubleshooting.steps[0]).toContain('To enable management tools');
    });

    it('should handle API connectivity errors', async () => {
      const error = new Error('Connection refused');
      mockApiClient.healthCheck.mockRejectedValue(error);

      const result = await handlers.handleDiagnostic({ params: { arguments: {} } });

      expect(result.success).toBe(true);
      expect(result.data.apiConfiguration.status.connected).toBe(false);
      expect(result.data.apiConfiguration.status.error).toBe('Connection refused');
    });
  });

  describe('Error handling', () => {
    it('should handle authentication errors', async () => {
      const authError = new N8nAuthenticationError('Invalid API key');
      mockApiClient.getWorkflow.mockRejectedValue(authError);

      const result = await handleGetWorkflow({ id: 'test-id' });

      expect(result).toEqual({
        success: false,
        error: 'Invalid API key',
        code: 'AUTHENTICATION_ERROR',
      });
    });

    it('should handle rate limit errors', async () => {
      const rateLimitError = new N8nRateLimitError('Too many requests', 60);
      mockApiClient.listWorkflows.mockRejectedValue(rateLimitError);

      const result = await handleListWorkflows({});

      expect(result).toEqual({
        success: false,
        error: 'Too many requests',
        code: 'RATE_LIMIT_ERROR',
      });
    });

    it('should handle generic errors', async () => {
      const genericError = new Error('Something went wrong');
      mockApiClient.createWorkflow.mockRejectedValue(genericError);

      const result = await handleCreateWorkflow({
        name: 'Test',
        nodes: [],
        connections: {},
      });

      expect(result).toEqual({
        success: false,
        error: 'Something went wrong',
      });
    });
  });
});