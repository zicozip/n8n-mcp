#!/usr/bin/env ts-node

/**
 * TypeScript test script for n8n MCP integration fixes
 * Tests the protocol changes and identifies any remaining issues
 */

import http from 'http';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  response?: any;
}

class N8nMcpTester {
  private mcpProcess: ChildProcess | null = null;
  private readonly mcpPort = 3001;
  private readonly authToken = 'test-token-for-n8n-testing-minimum-32-chars';
  private sessionId: string | null = null;

  async start(): Promise<void> {
    console.log('🔧 Testing n8n MCP Integration Fixes');
    console.log('====================================\n');

    try {
      await this.startMcpServer();
      await this.runTests();
    } finally {
      await this.cleanup();
    }
  }

  private async startMcpServer(): Promise<void> {
    console.log('📦 Starting MCP server in n8n mode...');
    
    const projectRoot = path.resolve(__dirname, '..');
    
    this.mcpProcess = spawn('node', ['dist/mcp/index.js'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        N8N_MODE: 'true',
        MCP_MODE: 'http',
        AUTH_TOKEN: this.authToken,
        PORT: this.mcpPort.toString(),
        DEBUG_MCP: 'true'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Log server output
    this.mcpProcess.stdout?.on('data', (data) => {
      console.log(`[MCP] ${data.toString().trim()}`);
    });

    this.mcpProcess.stderr?.on('data', (data) => {
      console.error(`[MCP ERROR] ${data.toString().trim()}`);
    });

    // Wait for server to be ready
    await this.waitForServer();
  }

  private async waitForServer(): Promise<void> {
    console.log('⏳ Waiting for MCP server to be ready...');
    
    for (let i = 0; i < 30; i++) {
      try {
        await this.makeHealthCheck();
        console.log('✅ MCP server is ready!\n');
        return;
      } catch (error) {
        if (i === 29) {
          throw new Error('MCP server failed to start within 30 seconds');
        }
        await this.sleep(1000);
      }
    }
  }

  private makeHealthCheck(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${this.mcpPort}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Health check failed: ${res.statusCode}`));
        }
      });

      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Health check timeout'));
      });
    });
  }

  private async runTests(): Promise<void> {
    const tests: TestResult[] = [];

    // Test 1: Initialize with correct protocol version
    tests.push(await this.testInitialize());

    // Test 2: List tools
    tests.push(await this.testListTools());

    // Test 3: Call tools_documentation
    tests.push(await this.testToolCall('tools_documentation', {}));

    // Test 4: Call get_node_essentials with parameters
    tests.push(await this.testToolCall('get_node_essentials', {
      nodeType: 'nodes-base.httpRequest'
    }));

    // Test 5: Call with invalid parameters (should handle gracefully)
    tests.push(await this.testToolCallInvalid());

    this.printResults(tests);
  }

  private async testInitialize(): Promise<TestResult> {
    console.log('🧪 Testing MCP Initialize...');
    
    try {
      const response = await this.makeRequest('POST', '/mcp', {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          clientInfo: { name: 'n8n-test', version: '1.0.0' }
        },
        id: 1
      });

      if (response.statusCode !== 200) {
        return {
          name: 'Initialize',
          passed: false,
          error: `HTTP ${response.statusCode}`
        };
      }

      const data = JSON.parse(response.body);
      
      // Extract session ID
      this.sessionId = response.headers['mcp-session-id'] as string;
      
      if (data.result?.protocolVersion === '2025-03-26') {
        return {
          name: 'Initialize',
          passed: true,
          response: data
        };
      } else {
        return {
          name: 'Initialize',
          passed: false,
          error: `Wrong protocol version: ${data.result?.protocolVersion}`,
          response: data
        };
      }
    } catch (error) {
      return {
        name: 'Initialize',
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async testListTools(): Promise<TestResult> {
    console.log('🧪 Testing Tools List...');
    
    try {
      const response = await this.makeRequest('POST', '/mcp', {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 2
      }, this.sessionId);

      if (response.statusCode !== 200) {
        return {
          name: 'List Tools',
          passed: false,
          error: `HTTP ${response.statusCode}`
        };
      }

      const data = JSON.parse(response.body);
      
      if (data.result?.tools && Array.isArray(data.result.tools)) {
        return {
          name: 'List Tools',
          passed: true,
          response: { toolCount: data.result.tools.length }
        };
      } else {
        return {
          name: 'List Tools',
          passed: false,
          error: 'Missing or invalid tools array',
          response: data
        };
      }
    } catch (error) {
      return {
        name: 'List Tools',
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async testToolCall(toolName: string, args: any): Promise<TestResult> {
    console.log(`🧪 Testing Tool Call: ${toolName}...`);
    
    try {
      const response = await this.makeRequest('POST', '/mcp', {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        },
        id: 3
      }, this.sessionId);

      if (response.statusCode !== 200) {
        return {
          name: `Tool Call: ${toolName}`,
          passed: false,
          error: `HTTP ${response.statusCode}`
        };
      }

      const data = JSON.parse(response.body);
      
      if (data.result?.content && Array.isArray(data.result.content)) {
        return {
          name: `Tool Call: ${toolName}`,
          passed: true,
          response: { contentItems: data.result.content.length }
        };
      } else {
        return {
          name: `Tool Call: ${toolName}`,
          passed: false,
          error: 'Missing or invalid content array',
          response: data
        };
      }
    } catch (error) {
      return {
        name: `Tool Call: ${toolName}`,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async testToolCallInvalid(): Promise<TestResult> {
    console.log('🧪 Testing Tool Call with invalid parameters...');
    
    try {
      const response = await this.makeRequest('POST', '/mcp', {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'get_node_essentials',
          arguments: {} // Missing required nodeType parameter
        },
        id: 4
      }, this.sessionId);

      if (response.statusCode !== 200) {
        return {
          name: 'Tool Call: Invalid Params',
          passed: false,
          error: `HTTP ${response.statusCode}`
        };
      }

      const data = JSON.parse(response.body);
      
      // Should either return an error response or handle gracefully
      if (data.error || (data.result?.isError && data.result?.content)) {
        return {
          name: 'Tool Call: Invalid Params',
          passed: true,
          response: { handledGracefully: true }
        };
      } else {
        return {
          name: 'Tool Call: Invalid Params',
          passed: false,
          error: 'Did not handle invalid parameters properly',
          response: data
        };
      }
    } catch (error) {
      return {
        name: 'Tool Call: Invalid Params',
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private makeRequest(method: string, path: string, data?: any, sessionId?: string | null): Promise<{
    statusCode: number;
    headers: http.IncomingHttpHeaders;
    body: string;
  }> {
    return new Promise((resolve, reject) => {
      const postData = data ? JSON.stringify(data) : '';
      
      const options: http.RequestOptions = {
        hostname: 'localhost',
        port: this.mcpPort,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`,
          ...(postData && { 'Content-Length': Buffer.byteLength(postData) }),
          ...(sessionId && { 'Mcp-Session-Id': sessionId })
        }
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body
          });
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  private printResults(tests: TestResult[]): void {
    console.log('\n📊 TEST RESULTS');
    console.log('================');
    
    const passed = tests.filter(t => t.passed).length;
    const total = tests.length;
    
    tests.forEach(test => {
      const status = test.passed ? '✅' : '❌';
      console.log(`${status} ${test.name}`);
      if (!test.passed && test.error) {
        console.log(`   Error: ${test.error}`);
      }
      if (test.response) {
        console.log(`   Response: ${JSON.stringify(test.response, null, 2)}`);
      }
    });
    
    console.log(`\n📈 Summary: ${passed}/${total} tests passed`);
    
    if (passed === total) {
      console.log('🎉 All tests passed! The n8n integration fixes should resolve the schema validation errors.');
    } else {
      console.log('❌ Some tests failed. Please review the errors above.');
    }
  }

  private async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up...');
    
    if (this.mcpProcess) {
      this.mcpProcess.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await new Promise<void>((resolve) => {
        if (!this.mcpProcess) {
          resolve();
          return;
        }
        
        const timeout = setTimeout(() => {
          this.mcpProcess?.kill('SIGKILL');
          resolve();
        }, 5000);
        
        this.mcpProcess.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    
    console.log('✅ Cleanup complete');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the tests
if (require.main === module) {
  const tester = new N8nMcpTester();
  tester.start().catch(console.error);
}

export { N8nMcpTester };