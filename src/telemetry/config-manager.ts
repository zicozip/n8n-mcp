/**
 * Telemetry Configuration Manager
 * Handles telemetry settings, opt-in/opt-out, and first-run detection
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { hostname, platform, arch } from 'os';

export interface TelemetryConfig {
  enabled: boolean;
  userId: string;
  firstRun?: string;
  lastModified?: string;
  version?: string;
}

export class TelemetryConfigManager {
  private static instance: TelemetryConfigManager;
  private readonly configDir: string;
  private readonly configPath: string;
  private config: TelemetryConfig | null = null;

  private constructor() {
    this.configDir = join(homedir(), '.n8n-mcp');
    this.configPath = join(this.configDir, 'telemetry.json');
  }

  static getInstance(): TelemetryConfigManager {
    if (!TelemetryConfigManager.instance) {
      TelemetryConfigManager.instance = new TelemetryConfigManager();
    }
    return TelemetryConfigManager.instance;
  }

  /**
   * Generate a deterministic anonymous user ID based on machine characteristics
   */
  private generateUserId(): string {
    const machineId = `${hostname()}-${platform()}-${arch()}-${homedir()}`;
    return createHash('sha256').update(machineId).digest('hex').substring(0, 16);
  }

  /**
   * Load configuration from disk or create default
   */
  loadConfig(): TelemetryConfig {
    if (this.config) {
      return this.config;
    }

    if (!existsSync(this.configPath)) {
      // First run - create default config
      const version = this.getPackageVersion();

      // Check if telemetry is disabled via environment variable
      const envDisabled = this.isDisabledByEnvironment();

      this.config = {
        enabled: !envDisabled, // Respect env var on first run
        userId: this.generateUserId(),
        firstRun: new Date().toISOString(),
        version
      };

      this.saveConfig();

      // Only show notice if not disabled via environment
      if (!envDisabled) {
        this.showFirstRunNotice();
      }

      return this.config;
    }

    try {
      const rawConfig = readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(rawConfig);

      // Ensure userId exists (for upgrades from older versions)
      if (!this.config!.userId) {
        this.config!.userId = this.generateUserId();
        this.saveConfig();
      }

      return this.config!;
    } catch (error) {
      console.error('Failed to load telemetry config, using defaults:', error);
      this.config = {
        enabled: false,
        userId: this.generateUserId()
      };
      return this.config;
    }
  }

  /**
   * Save configuration to disk
   */
  private saveConfig(): void {
    if (!this.config) return;

    try {
      if (!existsSync(this.configDir)) {
        mkdirSync(this.configDir, { recursive: true });
      }

      this.config.lastModified = new Date().toISOString();
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save telemetry config:', error);
    }
  }

  /**
   * Check if telemetry is enabled
   * Priority: Environment variable > Config file > Default (true)
   */
  isEnabled(): boolean {
    // Check environment variables first (for Docker users)
    if (this.isDisabledByEnvironment()) {
      return false;
    }

    const config = this.loadConfig();
    return config.enabled;
  }

  /**
   * Check if telemetry is disabled via environment variable
   */
  private isDisabledByEnvironment(): boolean {
    const envVars = [
      'N8N_MCP_TELEMETRY_DISABLED',
      'TELEMETRY_DISABLED',
      'DISABLE_TELEMETRY'
    ];

    for (const varName of envVars) {
      const value = process.env[varName];
      if (value !== undefined) {
        const normalized = value.toLowerCase().trim();

        // Warn about invalid values
        if (!['true', 'false', '1', '0', ''].includes(normalized)) {
          console.warn(
            `⚠️  Invalid telemetry environment variable value: ${varName}="${value}"\n` +
            `   Use "true" to disable or "false" to enable telemetry.`
          );
        }

        // Accept common truthy values
        if (normalized === 'true' || normalized === '1') {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get the anonymous user ID
   */
  getUserId(): string {
    const config = this.loadConfig();
    return config.userId;
  }

  /**
   * Check if this is the first run
   */
  isFirstRun(): boolean {
    return !existsSync(this.configPath);
  }

  /**
   * Enable telemetry
   */
  enable(): void {
    const config = this.loadConfig();
    config.enabled = true;
    this.config = config;
    this.saveConfig();
    console.log('✓ Anonymous telemetry enabled');
  }

  /**
   * Disable telemetry
   */
  disable(): void {
    const config = this.loadConfig();
    config.enabled = false;
    this.config = config;
    this.saveConfig();
    console.log('✓ Anonymous telemetry disabled');
  }

  /**
   * Get current status
   */
  getStatus(): string {
    const config = this.loadConfig();

    // Check if disabled by environment
    const envDisabled = this.isDisabledByEnvironment();

    let status = config.enabled ? 'ENABLED' : 'DISABLED';
    if (envDisabled) {
      status = 'DISABLED (via environment variable)';
    }

    return `
Telemetry Status: ${status}
Anonymous ID: ${config.userId}
First Run: ${config.firstRun || 'Unknown'}
Config Path: ${this.configPath}

To opt-out: npx n8n-mcp telemetry disable
To opt-in:  npx n8n-mcp telemetry enable

For Docker: Set N8N_MCP_TELEMETRY_DISABLED=true
`;
  }

  /**
   * Show first-run notice to user
   */
  private showFirstRunNotice(): void {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║              Anonymous Usage Statistics                     ║
╠════════════════════════════════════════════════════════════╣
║                                                             ║
║  n8n-mcp collects anonymous usage data to improve the      ║
║  tool and understand how it's being used.                  ║
║                                                             ║
║  We track:                                                 ║
║  • Which MCP tools are used (no parameters)                ║
║  • Workflow structures (sanitized, no sensitive data)      ║
║  • Error patterns (hashed, no details)                     ║
║  • Performance metrics (timing, success rates)             ║
║                                                             ║
║  We NEVER collect:                                         ║
║  • URLs, API keys, or credentials                          ║
║  • Workflow content or actual data                         ║
║  • Personal or identifiable information                    ║
║  • n8n instance details or locations                       ║
║                                                             ║
║  Your anonymous ID: ${this.config?.userId || 'generating...'}          ║
║                                                             ║
║  This helps me understand usage patterns and improve       ║
║  n8n-mcp for everyone. Thank you for your support!         ║
║                                                             ║
║  To opt-out at any time:                                   ║
║  npx n8n-mcp telemetry disable                            ║
║                                                             ║
║  Data deletion requests:                                   ║
║  Email romuald@n8n-mcp.com with your anonymous ID          ║
║                                                             ║
║  Learn more:                                               ║
║  https://github.com/czlonkowski/n8n-mcp/blob/main/PRIVACY.md ║
║                                                             ║
╚════════════════════════════════════════════════════════════╝
`);
  }

  /**
   * Get package version safely
   */
  private getPackageVersion(): string {
    try {
      // Try multiple approaches to find package.json
      const possiblePaths = [
        resolve(__dirname, '..', '..', 'package.json'),
        resolve(process.cwd(), 'package.json'),
        resolve(__dirname, '..', '..', '..', 'package.json')
      ];

      for (const packagePath of possiblePaths) {
        if (existsSync(packagePath)) {
          const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
          if (packageJson.version) {
            return packageJson.version;
          }
        }
      }

      // Fallback: try require (works in some environments)
      try {
        const packageJson = require('../../package.json');
        return packageJson.version || 'unknown';
      } catch {
        // Ignore require error
      }

      return 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }
}