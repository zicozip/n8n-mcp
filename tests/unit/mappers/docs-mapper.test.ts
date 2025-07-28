import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DocsMapper } from '@/mappers/docs-mapper';
import { promises as fs } from 'fs';
import path from 'path';

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn()
  }
}));

// Mock process.cwd()
const originalCwd = process.cwd;
beforeEach(() => {
  process.cwd = vi.fn(() => '/mocked/path');
});

afterEach(() => {
  process.cwd = originalCwd;
  vi.clearAllMocks();
});

describe('DocsMapper', () => {
  let docsMapper: DocsMapper;
  let consoleLogSpy: any;

  beforeEach(() => {
    docsMapper = new DocsMapper();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('fetchDocumentation', () => {
    describe('successful documentation fetch', () => {
      it('should fetch documentation for httpRequest node', async () => {
        const mockContent = '# HTTP Request Node\n\nDocumentation content';
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await docsMapper.fetchDocumentation('httpRequest');

        expect(result).toBe(mockContent);
        expect(fs.readFile).toHaveBeenCalledWith(
          expect.stringContaining('httprequest.md'),
          'utf-8'
        );
        expect(consoleLogSpy).toHaveBeenCalledWith('📄 Looking for docs for: httpRequest -> httprequest');
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✓ Found docs at:'));
      });

      it('should apply known fixes for node types', async () => {
        const mockContent = '# Webhook Node\n\nDocumentation';
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await docsMapper.fetchDocumentation('webhook');

        expect(result).toBe(mockContent);
        expect(fs.readFile).toHaveBeenCalledWith(
          expect.stringContaining('webhook.md'),
          'utf-8'
        );
      });

      it('should handle node types with package prefix', async () => {
        const mockContent = '# Code Node\n\nDocumentation';
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await docsMapper.fetchDocumentation('n8n-nodes-base.code');

        expect(result).toBe(mockContent);
        expect(consoleLogSpy).toHaveBeenCalledWith('📄 Looking for docs for: n8n-nodes-base.code -> code');
      });

      it('should try multiple paths until finding documentation', async () => {
        const mockContent = '# Slack Node\n\nDocumentation';
        // First few attempts fail
        vi.mocked(fs.readFile)
          .mockRejectedValueOnce(new Error('Not found'))
          .mockRejectedValueOnce(new Error('Not found'))
          .mockResolvedValueOnce(mockContent);

        const result = await docsMapper.fetchDocumentation('slack');

        expect(result).toBe(mockContent);
        expect(fs.readFile).toHaveBeenCalledTimes(3);
      });

      it('should check directory paths with index.md', async () => {
        const mockContent = '# Complex Node\n\nDocumentation';
        // Simulate finding in a directory structure - reject enough times to reach index.md paths
        vi.mocked(fs.readFile)
          .mockRejectedValueOnce(new Error('Not found')) // core-nodes direct
          .mockRejectedValueOnce(new Error('Not found')) // app-nodes direct
          .mockRejectedValueOnce(new Error('Not found')) // trigger-nodes direct
          .mockRejectedValueOnce(new Error('Not found')) // langchain root direct
          .mockRejectedValueOnce(new Error('Not found')) // langchain sub direct
          .mockResolvedValueOnce(mockContent); // Found in directory/index.md

        const result = await docsMapper.fetchDocumentation('complexNode');

        expect(result).toBe(mockContent);
        // Check that it eventually tried an index.md path
        expect(fs.readFile).toHaveBeenCalledTimes(6);
        const calls = vi.mocked(fs.readFile).mock.calls;
        const indexCalls = calls.filter(call => call[0].includes('index.md'));
        expect(indexCalls.length).toBeGreaterThan(0);
      });
    });

    describe('documentation not found', () => {
      it('should return null when documentation is not found', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT: no such file'));

        const result = await docsMapper.fetchDocumentation('nonExistentNode');

        expect(result).toBeNull();
        expect(consoleLogSpy).toHaveBeenCalledWith('  ✗ No docs found for nonexistentnode');
      });

      it('should return null for empty node type', async () => {
        const result = await docsMapper.fetchDocumentation('');

        expect(result).toBeNull();
        expect(consoleLogSpy).toHaveBeenCalledWith('⚠️  Could not extract node name from: ');
      });

      it('should handle invalid node type format', async () => {
        const result = await docsMapper.fetchDocumentation('.');

        expect(result).toBeNull();
        expect(consoleLogSpy).toHaveBeenCalledWith('⚠️  Could not extract node name from: .');
      });
    });

    describe('path construction', () => {
      it('should construct correct paths for core nodes', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('Not found'));

        await docsMapper.fetchDocumentation('testNode');

        // Check that it tried core-nodes path
        expect(fs.readFile).toHaveBeenCalledWith(
          path.join('/mocked/path', 'n8n-docs', 'docs/integrations/builtin/core-nodes/n8n-nodes-base.testnode.md'),
          'utf-8'
        );
      });

      it('should construct correct paths for app nodes', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('Not found'));

        await docsMapper.fetchDocumentation('appNode');

        // Check that it tried app-nodes path
        expect(fs.readFile).toHaveBeenCalledWith(
          path.join('/mocked/path', 'n8n-docs', 'docs/integrations/builtin/app-nodes/n8n-nodes-base.appnode.md'),
          'utf-8'
        );
      });

      it('should construct correct paths for trigger nodes', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('Not found'));

        await docsMapper.fetchDocumentation('triggerNode');

        // Check that it tried trigger-nodes path
        expect(fs.readFile).toHaveBeenCalledWith(
          path.join('/mocked/path', 'n8n-docs', 'docs/integrations/builtin/trigger-nodes/n8n-nodes-base.triggernode.md'),
          'utf-8'
        );
      });

      it('should construct correct paths for langchain nodes', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('Not found'));

        await docsMapper.fetchDocumentation('aiNode');

        // Check that it tried langchain paths
        expect(fs.readFile).toHaveBeenCalledWith(
          expect.stringContaining('cluster-nodes/root-nodes/n8n-nodes-langchain.ainode'),
          'utf-8'
        );
        expect(fs.readFile).toHaveBeenCalledWith(
          expect.stringContaining('cluster-nodes/sub-nodes/n8n-nodes-langchain.ainode'),
          'utf-8'
        );
      });
    });

    describe('error handling', () => {
      it('should handle file system errors gracefully', async () => {
        const customError = new Error('Permission denied');
        vi.mocked(fs.readFile).mockRejectedValue(customError);

        const result = await docsMapper.fetchDocumentation('testNode');

        expect(result).toBeNull();
        // Should have tried all possible paths
        expect(fs.readFile).toHaveBeenCalledTimes(10); // 5 direct paths + 5 directory paths
      });

      it('should handle non-Error exceptions', async () => {
        vi.mocked(fs.readFile).mockRejectedValue('String error');

        const result = await docsMapper.fetchDocumentation('testNode');

        expect(result).toBeNull();
      });
    });

    describe('KNOWN_FIXES mapping', () => {
      it('should apply fix for httpRequest', async () => {
        vi.mocked(fs.readFile).mockResolvedValueOnce('content');

        await docsMapper.fetchDocumentation('httpRequest');

        expect(fs.readFile).toHaveBeenCalledWith(
          expect.stringContaining('httprequest.md'),
          'utf-8'
        );
      });

      it('should apply fix for respondToWebhook', async () => {
        vi.mocked(fs.readFile).mockResolvedValueOnce('content');

        await docsMapper.fetchDocumentation('respondToWebhook');

        expect(fs.readFile).toHaveBeenCalledWith(
          expect.stringContaining('respondtowebhook.md'),
          'utf-8'
        );
      });

      it('should preserve casing for unknown nodes', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('Not found'));

        await docsMapper.fetchDocumentation('CustomNode');

        expect(fs.readFile).toHaveBeenCalledWith(
          expect.stringContaining('customnode.md'), // toLowerCase applied
          'utf-8'
        );
      });
    });

    describe('logging', () => {
      it('should log search progress', async () => {
        vi.mocked(fs.readFile).mockResolvedValueOnce('content');

        await docsMapper.fetchDocumentation('testNode');

        expect(consoleLogSpy).toHaveBeenCalledWith('📄 Looking for docs for: testNode -> testnode');
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✓ Found docs at:'));
      });

      it('should log when documentation is not found', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('Not found'));

        await docsMapper.fetchDocumentation('missingNode');

        expect(consoleLogSpy).toHaveBeenCalledWith('📄 Looking for docs for: missingNode -> missingnode');
        expect(consoleLogSpy).toHaveBeenCalledWith('  ✗ No docs found for missingnode');
      });
    });

    describe('edge cases', () => {
      it('should handle very long node names', async () => {
        const longNodeName = 'a'.repeat(100);
        vi.mocked(fs.readFile).mockRejectedValue(new Error('Not found'));

        const result = await docsMapper.fetchDocumentation(longNodeName);

        expect(result).toBeNull();
        expect(fs.readFile).toHaveBeenCalled();
      });

      it('should handle node names with special characters', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('Not found'));

        const result = await docsMapper.fetchDocumentation('node-with-dashes_and_underscores');

        expect(result).toBeNull();
        expect(fs.readFile).toHaveBeenCalledWith(
          expect.stringContaining('node-with-dashes_and_underscores.md'),
          'utf-8'
        );
      });

      it('should handle multiple dots in node type', async () => {
        vi.mocked(fs.readFile).mockResolvedValueOnce('content');

        const result = await docsMapper.fetchDocumentation('com.example.nodes.custom');

        expect(result).toBe('content');
        expect(consoleLogSpy).toHaveBeenCalledWith('📄 Looking for docs for: com.example.nodes.custom -> custom');
      });
    });
  });

  describe('DocsMapper instance', () => {
    it('should use consistent docsPath across instances', () => {
      const mapper1 = new DocsMapper();
      const mapper2 = new DocsMapper();

      // Both should construct the same base path
      expect(mapper1['docsPath']).toBe(mapper2['docsPath']);
      expect(mapper1['docsPath']).toBe(path.join('/mocked/path', 'n8n-docs'));
    });

    it('should maintain KNOWN_FIXES as readonly', () => {
      const mapper = new DocsMapper();
      
      // KNOWN_FIXES should be accessible but not modifiable
      expect(mapper['KNOWN_FIXES']).toBeDefined();
      expect(mapper['KNOWN_FIXES']['httpRequest']).toBe('httprequest');
    });
  });
});