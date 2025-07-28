import { bench, describe } from 'vitest';
import { ConfigValidator } from '../../src/services/config-validator';
import { EnhancedConfigValidator } from '../../src/services/enhanced-config-validator';
import { ExpressionValidator } from '../../src/services/expression-validator';
import { WorkflowValidator } from '../../src/services/workflow-validator';
import { NodeRepository } from '../../src/database/node-repository';
import { SQLiteStorageService } from '../../src/services/sqlite-storage-service';
import { NodeLoader } from '../../src/loaders/node-loader';

describe('Validation Performance', () => {
  let validator: ConfigValidator;
  let enhancedValidator: EnhancedConfigValidator;
  let expressionValidator: ExpressionValidator;
  let workflowValidator: WorkflowValidator;
  let repository: NodeRepository;
  let storage: SQLiteStorageService;

  const simpleConfig = {
    url: 'https://api.example.com',
    method: 'GET',
    authentication: 'none'
  };

  const complexConfig = {
    resource: 'message',
    operation: 'send',
    channel: 'C1234567890',
    text: 'Hello from benchmark',
    authentication: {
      type: 'oAuth2',
      credentials: {
        oauthTokenData: {
          access_token: 'xoxb-test-token'
        }
      }
    },
    options: {
      as_user: true,
      link_names: true,
      parse: 'full',
      reply_broadcast: false,
      thread_ts: '',
      unfurl_links: true,
      unfurl_media: true
    }
  };

  const simpleWorkflow = {
    name: 'Simple Workflow',
    nodes: [
      {
        id: '1',
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [250, 300],
        parameters: {}
      },
      {
        id: '2',
        name: 'HTTP Request',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [450, 300],
        parameters: {
          url: 'https://api.example.com',
          method: 'GET'
        }
      }
    ],
    connections: {
      '1': {
        main: [
          [
            {
              node: '2',
              type: 'main',
              index: 0
            }
          ]
        ]
      }
    }
  };

  const complexWorkflow = {
    name: 'Complex Workflow',
    nodes: Array.from({ length: 20 }, (_, i) => ({
      id: `${i + 1}`,
      name: `Node ${i + 1}`,
      type: i % 3 === 0 ? 'n8n-nodes-base.httpRequest' : 
            i % 3 === 1 ? 'n8n-nodes-base.slack' : 
            'n8n-nodes-base.code',
      typeVersion: 1,
      position: [250 + (i % 5) * 200, 300 + Math.floor(i / 5) * 150],
      parameters: {
        url: '={{ $json.url }}',
        method: 'POST',
        body: '={{ JSON.stringify($json) }}',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    })),
    connections: Object.fromEntries(
      Array.from({ length: 19 }, (_, i) => [
        `${i + 1}`,
        {
          main: [[{ node: `${i + 2}`, type: 'main', index: 0 }]]
        }
      ])
    )
  };

  beforeAll(async () => {
    storage = new SQLiteStorageService(':memory:');
    repository = new NodeRepository(storage);
    const loader = new NodeLoader(repository);
    await loader.loadPackage('n8n-nodes-base');
    
    validator = new ConfigValidator(repository);
    enhancedValidator = new EnhancedConfigValidator(repository);
    expressionValidator = new ExpressionValidator();
    workflowValidator = new WorkflowValidator(repository);
  });

  afterAll(() => {
    storage.close();
  });

  bench('validateNode - simple config minimal', async () => {
    await validator.validateNode('n8n-nodes-base.httpRequest', simpleConfig, 'minimal');
  }, {
    iterations: 1000,
    warmupIterations: 100,
    warmupTime: 500,
    time: 3000
  });

  bench('validateNode - simple config strict', async () => {
    await validator.validateNode('n8n-nodes-base.httpRequest', simpleConfig, 'strict');
  }, {
    iterations: 500,
    warmupIterations: 50,
    warmupTime: 500,
    time: 3000
  });

  bench('validateNode - complex config', async () => {
    await enhancedValidator.validateNode('n8n-nodes-base.slack', complexConfig, 'ai-friendly');
  }, {
    iterations: 500,
    warmupIterations: 50,
    warmupTime: 500,
    time: 3000
  });

  bench('validateMinimal - missing fields check', async () => {
    await validator.validateMinimal('n8n-nodes-base.httpRequest', {});
  }, {
    iterations: 2000,
    warmupIterations: 200,
    warmupTime: 500,
    time: 3000
  });

  bench('validateExpression - simple expression', async () => {
    expressionValidator.validateExpression('{{ $json.data }}');
  }, {
    iterations: 5000,
    warmupIterations: 500,
    warmupTime: 500,
    time: 3000
  });

  bench('validateExpression - complex expression', async () => {
    expressionValidator.validateExpression('{{ $node["HTTP Request"].json.items.map(item => item.id).join(",") }}');
  }, {
    iterations: 2000,
    warmupIterations: 200,
    warmupTime: 500,
    time: 3000
  });

  bench('validateWorkflow - simple workflow', async () => {
    await workflowValidator.validateWorkflow(simpleWorkflow);
  }, {
    iterations: 500,
    warmupIterations: 50,
    warmupTime: 500,
    time: 3000
  });

  bench('validateWorkflow - complex workflow', async () => {
    await workflowValidator.validateWorkflow(complexWorkflow);
  }, {
    iterations: 100,
    warmupIterations: 10,
    warmupTime: 500,
    time: 3000
  });

  bench('validateConnections - simple', async () => {
    workflowValidator.validateConnections(simpleWorkflow);
  }, {
    iterations: 2000,
    warmupIterations: 200,
    warmupTime: 500,
    time: 3000
  });

  bench('validateConnections - complex', async () => {
    workflowValidator.validateConnections(complexWorkflow);
  }, {
    iterations: 500,
    warmupIterations: 50,
    warmupTime: 500,
    time: 3000
  });

  bench('validateExpressions - workflow with many expressions', async () => {
    workflowValidator.validateExpressions(complexWorkflow);
  }, {
    iterations: 200,
    warmupIterations: 20,
    warmupTime: 500,
    time: 3000
  });

  bench('getPropertyDependencies', async () => {
    await enhancedValidator.getPropertyDependencies('n8n-nodes-base.httpRequest');
  }, {
    iterations: 1000,
    warmupIterations: 100,
    warmupTime: 500,
    time: 3000
  });
});