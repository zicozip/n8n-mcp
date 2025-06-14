export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
  timestamp?: boolean;
}

export class Logger {
  private config: LoggerConfig;
  private static instance: Logger;
  private useFileLogging = false;
  private fileStream: any = null;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      level: LogLevel.INFO,
      prefix: 'n8n-mcp',
      timestamp: true,
      ...config,
    };
  }

  static getInstance(config?: Partial<LoggerConfig>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  private formatMessage(level: string, message: string): string {
    const parts: string[] = [];
    
    if (this.config.timestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }
    
    if (this.config.prefix) {
      parts.push(`[${this.config.prefix}]`);
    }
    
    parts.push(`[${level}]`);
    parts.push(message);
    
    return parts.join(' ');
  }

  private log(level: LogLevel, levelName: string, message: string, ...args: any[]): void {
    if (level <= this.config.level) {
      const formattedMessage = this.formatMessage(levelName, message);
      
      // In HTTP mode during request handling, suppress console output
      // The ConsoleManager will handle this, but we add a safety check
      if (process.env.MCP_MODE === 'http' && process.env.MCP_REQUEST_ACTIVE === 'true') {
        // Silently drop the log during active MCP requests
        return;
      }
      
      switch (level) {
        case LogLevel.ERROR:
          console.error(formattedMessage, ...args);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage, ...args);
          break;
        default:
          console.log(formattedMessage, ...args);
      }
    }
  }

  error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, 'ERROR', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, 'WARN', message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, 'INFO', message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, ...args);
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  static parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'error':
        return LogLevel.ERROR;
      case 'warn':
        return LogLevel.WARN;
      case 'debug':
        return LogLevel.DEBUG;
      case 'info':
      default:
        return LogLevel.INFO;
    }
  }
}

// Create a default logger instance
export const logger = Logger.getInstance({
  level: Logger.parseLogLevel(process.env.LOG_LEVEL || 'info'),
});