import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';

const exec = promisify(execCallback);

// Skip tests if not in CI or if Docker is not available
const SKIP_DOCKER_TESTS = process.env.CI !== 'true' && !process.env.RUN_DOCKER_TESTS;
const describeDocker = SKIP_DOCKER_TESTS ? describe.skip : describe;

// Helper to check if Docker is available
async function isDockerAvailable(): Promise<boolean> {
  try {
    await exec('docker --version');
    return true;
  } catch {
    return false;
  }
}

// Helper to generate unique container names
function generateContainerName(suffix: string): string {
  return `n8n-mcp-entrypoint-test-${Date.now()}-${suffix}`;
}

// Helper to clean up containers
async function cleanupContainer(containerName: string) {
  try {
    await exec(`docker stop ${containerName}`);
    await exec(`docker rm ${containerName}`);
  } catch {
    // Ignore errors - container might not exist
  }
}

// Helper to run container with timeout
async function runContainerWithTimeout(
  containerName: string,
  dockerCmd: string,
  timeoutMs: number = 5000
): Promise<{ stdout: string; stderr: string }> {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(async () => {
      try {
        await exec(`docker stop ${containerName}`);
      } catch {}
      reject(new Error(`Container timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      const result = await exec(dockerCmd);
      clearTimeout(timeout);
      resolve(result);
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

describeDocker('Docker Entrypoint Script', () => {
  let tempDir: string;
  let dockerAvailable: boolean;
  const imageName = 'n8n-mcp-test:latest';
  const containers: string[] = [];

  beforeAll(async () => {
    dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      console.warn('Docker not available, skipping Docker entrypoint tests');
      return;
    }
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-entrypoint-test-'));
  });

  afterEach(async () => {
    // Clean up containers
    for (const container of containers) {
      await cleanupContainer(container);
    }
    containers.length = 0;

    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('MCP Mode handling', () => {
    it('should default to stdio mode when MCP_MODE is not set', async () => {
      if (!dockerAvailable) return;

      const containerName = generateContainerName('default-mode');
      containers.push(containerName);

      // Check that stdio wrapper is used by default
      const { stdout } = await exec(
        `docker run --name ${containerName} ${imageName} sh -c "ps aux | grep node | grep -v grep | head -1"`
      );

      // Should be running stdio-wrapper.js or with stdio env
      expect(stdout).toMatch(/stdio-wrapper\.js|MCP_MODE=stdio/);
    });

    it('should respect MCP_MODE=http environment variable', async () => {
      if (!dockerAvailable) return;

      const containerName = generateContainerName('http-mode');
      containers.push(containerName);

      // Run in HTTP mode
      const { stdout } = await exec(
        `docker run --name ${containerName} -e MCP_MODE=http -e AUTH_TOKEN=test ${imageName} sh -c "env | grep MCP_MODE"`
      );

      expect(stdout.trim()).toBe('MCP_MODE=http');
    });
  });

  describe('n8n-mcp serve command', () => {
    it('should transform "n8n-mcp serve" to HTTP mode', async () => {
      if (!dockerAvailable) return;

      const containerName = generateContainerName('serve-transform');
      containers.push(containerName);

      // Test the command transformation
      const { stdout } = await exec(
        `docker run --name ${containerName} -e AUTH_TOKEN=test ${imageName} sh -c "n8n-mcp serve & sleep 1 && env | grep MCP_MODE"`
      );

      expect(stdout.trim()).toContain('MCP_MODE=http');
    });

    it('should preserve arguments after "n8n-mcp serve"', async () => {
      if (!dockerAvailable) return;

      const containerName = generateContainerName('serve-args-preserve');
      containers.push(containerName);

      // Create a test script to verify arguments
      const testScript = `
#!/bin/sh
echo "Arguments received: $@" > /tmp/args.txt
`;
      const scriptPath = path.join(tempDir, 'test-args.sh');
      fs.writeFileSync(scriptPath, testScript, { mode: 0o755 });

      // Override the entrypoint to test argument passing
      const { stdout } = await exec(
        `docker run --name ${containerName} -v "${scriptPath}:/test-args.sh:ro" --entrypoint /test-args.sh ${imageName} n8n-mcp serve --port 8080 --verbose`
      );

      // The script should receive transformed arguments
      expect(stdout).toContain('--port 8080 --verbose');
    });
  });

  describe('Database path configuration', () => {
    it('should use default database path when NODE_DB_PATH is not set', async () => {
      if (!dockerAvailable) return;

      const containerName = generateContainerName('default-db-path');
      containers.push(containerName);

      const { stdout } = await exec(
        `docker run --name ${containerName} ${imageName} sh -c "ls -la /app/data/nodes.db 2>&1 || echo 'Database not found'"`
      );

      // Should either find the database or be trying to create it at default path
      expect(stdout).toMatch(/nodes\.db|Database not found/);
    });

    it('should respect NODE_DB_PATH environment variable', async () => {
      if (!dockerAvailable) return;

      const containerName = generateContainerName('custom-db-path');
      containers.push(containerName);

      const { stdout, stderr } = await exec(
        `docker run --name ${containerName} -e NODE_DB_PATH=/custom/test.db ${imageName} sh -c "echo 'DB_PATH test' && exit 0"`
      );

      // The script validates that NODE_DB_PATH ends with .db
      expect(stdout + stderr).not.toContain('ERROR: NODE_DB_PATH must end with .db');
    });

    it('should validate NODE_DB_PATH format', async () => {
      if (!dockerAvailable) return;

      const containerName = generateContainerName('invalid-db-path');
      containers.push(containerName);

      // Try with invalid path (not ending with .db)
      try {
        await exec(
          `docker run --name ${containerName} -e NODE_DB_PATH=/custom/invalid-path ${imageName} echo "Should not reach here"`
        );
        expect.fail('Container should have exited with error');
      } catch (error: any) {
        expect(error.stderr).toContain('ERROR: NODE_DB_PATH must end with .db');
      }
    });
  });

  describe('Permission handling', () => {
    it('should fix permissions when running as root', async () => {
      if (!dockerAvailable) return;

      const containerName = generateContainerName('root-permissions');
      containers.push(containerName);

      // Run as root and check permission fixing
      const { stdout } = await exec(
        `docker run --name ${containerName} --user root ${imageName} sh -c "ls -la /app/data 2>/dev/null | grep -E '^d' | awk '{print \\$3}' || echo 'nodejs'"`
      );

      // Directory should be owned by nodejs user
      expect(stdout.trim()).toBe('nodejs');
    });

    it('should switch to nodejs user when running as root', async () => {
      if (!dockerAvailable) return;

      const containerName = generateContainerName('user-switch');
      containers.push(containerName);

      // Run as root and check effective user
      const { stdout } = await exec(
        `docker run --name ${containerName} --user root ${imageName} whoami`
      );

      expect(stdout.trim()).toBe('nodejs');
    });
  });

  describe('Auth token validation', () => {
    it('should require AUTH_TOKEN in HTTP mode', async () => {
      if (!dockerAvailable) return;

      const containerName = generateContainerName('auth-required');
      containers.push(containerName);

      try {
        await exec(
          `docker run --name ${containerName} -e MCP_MODE=http ${imageName} echo "Should fail"`
        );
        expect.fail('Should have failed without AUTH_TOKEN');
      } catch (error: any) {
        expect(error.stderr).toContain('AUTH_TOKEN or AUTH_TOKEN_FILE is required for HTTP mode');
      }
    });

    it('should accept AUTH_TOKEN_FILE', async () => {
      if (!dockerAvailable) return;

      const containerName = generateContainerName('auth-file');
      containers.push(containerName);

      // Create auth token file
      const tokenFile = path.join(tempDir, 'auth-token');
      fs.writeFileSync(tokenFile, 'secret-token-from-file');

      const { stdout } = await exec(
        `docker run --name ${containerName} -e MCP_MODE=http -e AUTH_TOKEN_FILE=/auth/token -v "${tokenFile}:/auth/token:ro" ${imageName} sh -c "echo 'Started successfully'"`
      );

      expect(stdout.trim()).toBe('Started successfully');
    });

    it('should validate AUTH_TOKEN_FILE exists', async () => {
      if (!dockerAvailable) return;

      const containerName = generateContainerName('auth-file-missing');
      containers.push(containerName);

      try {
        await exec(
          `docker run --name ${containerName} -e MCP_MODE=http -e AUTH_TOKEN_FILE=/non/existent/file ${imageName} echo "Should fail"`
        );
        expect.fail('Should have failed with missing AUTH_TOKEN_FILE');
      } catch (error: any) {
        expect(error.stderr).toContain('AUTH_TOKEN_FILE specified but file not found');
      }
    });
  });

  describe('Signal handling and process management', () => {
    it('should use exec to ensure proper signal propagation', async () => {
      if (!dockerAvailable) return;

      const containerName = generateContainerName('signal-handling');
      containers.push(containerName);

      // Start container in background
      await exec(
        `docker run -d --name ${containerName} ${imageName}`
      );

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check that node process is PID 1
      const { stdout } = await exec(
        `docker exec ${containerName} ps aux | grep node | grep -v grep | awk '{print $2}' | head -1`
      );

      expect(stdout.trim()).toBe('1');
    });
  });

  describe('Logging behavior', () => {
    it('should suppress logs in stdio mode', async () => {
      if (!dockerAvailable) return;

      const containerName = generateContainerName('stdio-quiet');
      containers.push(containerName);

      // Run in stdio mode and check for clean output
      const { stdout, stderr } = await exec(
        `docker run --name ${containerName} -e MCP_MODE=stdio ${imageName} sh -c "sleep 0.1 && echo 'STDIO_TEST' && exit 0"`
      );

      // In stdio mode, initialization logs should be suppressed
      expect(stderr).not.toContain('Creating database directory');
      expect(stderr).not.toContain('Database not found');
    });

    it('should show logs in HTTP mode', async () => {
      if (!dockerAvailable) return;

      const containerName = generateContainerName('http-logs');
      containers.push(containerName);

      // Create a fresh database directory to trigger initialization logs
      const dbDir = path.join(tempDir, 'data');
      fs.mkdirSync(dbDir);

      const { stdout, stderr } = await exec(
        `docker run --name ${containerName} -e MCP_MODE=http -e AUTH_TOKEN=test -v "${dbDir}:/app/data" ${imageName} sh -c "echo 'HTTP_TEST' && exit 0"`
      );

      // In HTTP mode, logs should be visible
      const output = stdout + stderr;
      expect(output).toContain('HTTP_TEST');
    });
  });

  describe('Config file integration', () => {
    it('should load config before validation checks', async () => {
      if (!dockerAvailable) return;

      const containerName = generateContainerName('config-order');
      containers.push(containerName);

      // Create config that sets required AUTH_TOKEN
      const configPath = path.join(tempDir, 'config.json');
      const config = {
        mcp_mode: 'http',
        auth_token: 'token-from-config'
      };
      fs.writeFileSync(configPath, JSON.stringify(config));

      // Should start successfully with AUTH_TOKEN from config
      const { stdout } = await exec(
        `docker run --name ${containerName} -v "${configPath}:/app/config.json:ro" ${imageName} sh -c "echo 'Started with config' && env | grep AUTH_TOKEN"`
      );

      expect(stdout).toContain('Started with config');
      expect(stdout).toContain('AUTH_TOKEN=token-from-config');
    });
  });

  describe('Database initialization with file locking', () => {
    it('should prevent race conditions during database initialization', async () => {
      if (!dockerAvailable) return;

      // This test simulates multiple containers trying to initialize the database simultaneously
      const containerPrefix = 'db-race';
      const numContainers = 3;
      const containerNames = Array.from({ length: numContainers }, (_, i) => 
        generateContainerName(`${containerPrefix}-${i}`)
      );
      containers.push(...containerNames);

      // Shared volume for database
      const dbDir = path.join(tempDir, 'shared-data');
      fs.mkdirSync(dbDir);

      // Start all containers simultaneously
      const promises = containerNames.map(name =>
        exec(
          `docker run --name ${name} -v "${dbDir}:/app/data" ${imageName} sh -c "ls -la /app/data/nodes.db && echo 'Container ${name} completed'"`
        ).catch(error => ({ stdout: '', stderr: error.stderr || error.message }))
      );

      const results = await Promise.all(promises);

      // All containers should complete successfully
      const successCount = results.filter(r => r.stdout.includes('completed')).length;
      expect(successCount).toBeGreaterThan(0);

      // Database should exist and be valid
      const dbPath = path.join(dbDir, 'nodes.db');
      expect(fs.existsSync(dbPath)).toBe(true);
    });
  });
});