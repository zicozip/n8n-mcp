/**
 * Node-Specific Validators
 * 
 * Provides detailed validation logic for commonly used n8n nodes.
 * Each validator understands the specific requirements and patterns of its node.
 */

import { ValidationError, ValidationWarning } from './config-validator';

export interface NodeValidationContext {
  config: Record<string, any>;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
  autofix: Record<string, any>;
}

export class NodeSpecificValidators {
  /**
   * Validate Slack node configuration with operation awareness
   */
  static validateSlack(context: NodeValidationContext): void {
    const { config, errors, warnings, suggestions } = context;
    const { resource, operation } = config;
    
    // Message operations
    if (resource === 'message') {
      switch (operation) {
        case 'send':
          this.validateSlackSendMessage(context);
          break;
        case 'update':
          this.validateSlackUpdateMessage(context);
          break;
        case 'delete':
          this.validateSlackDeleteMessage(context);
          break;
      }
    }
    
    // Channel operations
    else if (resource === 'channel') {
      switch (operation) {
        case 'create':
          this.validateSlackCreateChannel(context);
          break;
        case 'get':
        case 'getAll':
          // These operations have minimal requirements
          break;
      }
    }
    
    // User operations
    else if (resource === 'user') {
      if (operation === 'get' && !config.user) {
        errors.push({
          type: 'missing_required',
          property: 'user',
          message: 'User identifier required - use email, user ID, or username',
          fix: 'Set user to an email like "john@example.com" or user ID like "U1234567890"'
        });
      }
    }
  }
  
  private static validateSlackSendMessage(context: NodeValidationContext): void {
    const { config, errors, warnings, suggestions, autofix } = context;
    
    // Channel is required for sending messages
    if (!config.channel && !config.channelId) {
      errors.push({
        type: 'missing_required',
        property: 'channel',
        message: 'Channel is required to send a message',
        fix: 'Set channel to a channel name (e.g., "#general") or ID (e.g., "C1234567890")'
      });
    }
    
    // Message content validation
    if (!config.text && !config.blocks && !config.attachments) {
      errors.push({
        type: 'missing_required',
        property: 'text',
        message: 'Message content is required - provide text, blocks, or attachments',
        fix: 'Add text field with your message content'
      });
    }
    
    // Common patterns and suggestions
    if (config.text && config.text.length > 40000) {
      warnings.push({
        type: 'inefficient',
        property: 'text',
        message: 'Message text exceeds Slack\'s 40,000 character limit',
        suggestion: 'Split into multiple messages or use a file upload'
      });
    }
    
    // Thread reply validation
    if (config.replyToThread && !config.threadTs) {
      warnings.push({
        type: 'missing_common',
        property: 'threadTs',
        message: 'Thread timestamp required when replying to thread',
        suggestion: 'Set threadTs to the timestamp of the thread parent message'
      });
    }
    
    // Mention handling
    if (config.text?.includes('@') && !config.linkNames) {
      suggestions.push('Set linkNames=true to convert @mentions to user links');
      autofix.linkNames = true;
    }
  }
  
  private static validateSlackUpdateMessage(context: NodeValidationContext): void {
    const { config, errors } = context;
    
    if (!config.ts) {
      errors.push({
        type: 'missing_required',
        property: 'ts',
        message: 'Message timestamp (ts) is required to update a message',
        fix: 'Provide the timestamp of the message to update'
      });
    }
    
    if (!config.channel && !config.channelId) {
      errors.push({
        type: 'missing_required',
        property: 'channel',
        message: 'Channel is required to update a message',
        fix: 'Provide the channel where the message exists'
      });
    }
  }
  
  private static validateSlackDeleteMessage(context: NodeValidationContext): void {
    const { config, errors, warnings } = context;
    
    if (!config.ts) {
      errors.push({
        type: 'missing_required',
        property: 'ts',
        message: 'Message timestamp (ts) is required to delete a message',
        fix: 'Provide the timestamp of the message to delete'
      });
    }
    
    if (!config.channel && !config.channelId) {
      errors.push({
        type: 'missing_required',
        property: 'channel',
        message: 'Channel is required to delete a message',
        fix: 'Provide the channel where the message exists'
      });
    }
    
    warnings.push({
      type: 'security',
      message: 'Message deletion is permanent and cannot be undone',
      suggestion: 'Consider archiving or updating the message instead if you need to preserve history'
    });
  }
  
  private static validateSlackCreateChannel(context: NodeValidationContext): void {
    const { config, errors, warnings } = context;
    
    if (!config.name) {
      errors.push({
        type: 'missing_required',
        property: 'name',
        message: 'Channel name is required',
        fix: 'Provide a channel name (lowercase, no spaces, 1-80 characters)'
      });
    } else {
      // Validate channel name format
      const name = config.name;
      if (name.includes(' ')) {
        errors.push({
          type: 'invalid_value',
          property: 'name',
          message: 'Channel names cannot contain spaces',
          fix: 'Use hyphens or underscores instead of spaces'
        });
      }
      if (name !== name.toLowerCase()) {
        errors.push({
          type: 'invalid_value',
          property: 'name',
          message: 'Channel names must be lowercase',
          fix: 'Convert the channel name to lowercase'
        });
      }
      if (name.length > 80) {
        errors.push({
          type: 'invalid_value',
          property: 'name',
          message: 'Channel name exceeds 80 character limit',
          fix: 'Shorten the channel name'
        });
      }
    }
  }
  
  /**
   * Validate Google Sheets node configuration
   */
  static validateGoogleSheets(context: NodeValidationContext): void {
    const { config, errors, warnings, suggestions } = context;
    const { operation } = config;
    
    // Common validations
    if (!config.sheetId && !config.documentId) {
      errors.push({
        type: 'missing_required',
        property: 'sheetId',
        message: 'Spreadsheet ID is required',
        fix: 'Provide the Google Sheets document ID from the URL'
      });
    }
    
    // Operation-specific validations
    switch (operation) {
      case 'append':
        this.validateGoogleSheetsAppend(context);
        break;
      case 'read':
        this.validateGoogleSheetsRead(context);
        break;
      case 'update':
        this.validateGoogleSheetsUpdate(context);
        break;
      case 'delete':
        this.validateGoogleSheetsDelete(context);
        break;
    }
    
    // Range format validation
    if (config.range) {
      this.validateGoogleSheetsRange(config.range, errors, warnings);
    }
  }
  
  private static validateGoogleSheetsAppend(context: NodeValidationContext): void {
    const { config, errors, warnings, autofix } = context;
    
    if (!config.range) {
      errors.push({
        type: 'missing_required',
        property: 'range',
        message: 'Range is required for append operation',
        fix: 'Specify range like "Sheet1!A:B" or "Sheet1!A1:B10"'
      });
    }
    
    // Check for common append settings
    if (!config.options?.valueInputMode) {
      warnings.push({
        type: 'missing_common',
        property: 'options.valueInputMode',
        message: 'Consider setting valueInputMode for proper data formatting',
        suggestion: 'Use "USER_ENTERED" to parse formulas and dates, or "RAW" for literal values'
      });
      autofix.options = { ...config.options, valueInputMode: 'USER_ENTERED' };
    }
  }
  
  private static validateGoogleSheetsRead(context: NodeValidationContext): void {
    const { config, errors, suggestions } = context;
    
    if (!config.range) {
      errors.push({
        type: 'missing_required',
        property: 'range',
        message: 'Range is required for read operation',
        fix: 'Specify range like "Sheet1!A:B" or "Sheet1!A1:B10"'
      });
    }
    
    // Suggest data structure options
    if (!config.options?.dataStructure) {
      suggestions.push('Consider setting options.dataStructure to "object" for easier data manipulation');
    }
  }
  
  private static validateGoogleSheetsUpdate(context: NodeValidationContext): void {
    const { config, errors } = context;
    
    if (!config.range) {
      errors.push({
        type: 'missing_required',
        property: 'range',
        message: 'Range is required for update operation',
        fix: 'Specify the exact range to update like "Sheet1!A1:B10"'
      });
    }
    
    if (!config.values && !config.rawData) {
      errors.push({
        type: 'missing_required',
        property: 'values',
        message: 'Values are required for update operation',
        fix: 'Provide the data to write to the spreadsheet'
      });
    }
  }
  
  private static validateGoogleSheetsDelete(context: NodeValidationContext): void {
    const { config, errors, warnings } = context;
    
    if (!config.toDelete) {
      errors.push({
        type: 'missing_required',
        property: 'toDelete',
        message: 'Specify what to delete (rows or columns)',
        fix: 'Set toDelete to "rows" or "columns"'
      });
    }
    
    if (config.toDelete === 'rows' && !config.startIndex && config.startIndex !== 0) {
      errors.push({
        type: 'missing_required',
        property: 'startIndex',
        message: 'Start index is required when deleting rows',
        fix: 'Specify the starting row index (0-based)'
      });
    }
    
    warnings.push({
      type: 'security',
      message: 'Deletion is permanent. Consider backing up data first',
      suggestion: 'Read the data before deletion to create a backup'
    });
  }
  
  private static validateGoogleSheetsRange(
    range: string, 
    errors: ValidationError[], 
    warnings: ValidationWarning[]
  ): void {
    // Check basic format
    if (!range.includes('!')) {
      warnings.push({
        type: 'inefficient',
        property: 'range',
        message: 'Range should include sheet name for clarity',
        suggestion: 'Format: "SheetName!A1:B10" or "SheetName!A:B"'
      });
    }
    
    // Check for common mistakes
    if (range.includes(' ') && !range.match(/^'[^']+'/)) {
      errors.push({
        type: 'invalid_value',
        property: 'range',
        message: 'Sheet names with spaces must be quoted',
        fix: 'Use single quotes around sheet name: \'Sheet Name\'!A1:B10'
      });
    }
    
    // Validate A1 notation
    const a1Pattern = /^('[^']+'|[^!]+)!([A-Z]+\d*:?[A-Z]*\d*|[A-Z]+:[A-Z]+|\d+:\d+)$/i;
    if (!a1Pattern.test(range)) {
      warnings.push({
        type: 'inefficient',
        property: 'range',
        message: 'Range may not be in valid A1 notation',
        suggestion: 'Examples: "Sheet1!A1:B10", "Sheet1!A:B", "Sheet1!1:10"'
      });
    }
  }
  
  /**
   * Validate OpenAI node configuration
   */
  static validateOpenAI(context: NodeValidationContext): void {
    const { config, errors, warnings, suggestions } = context;
    const { resource, operation } = config;
    
    if (resource === 'chat' && operation === 'create') {
      // Model validation
      if (!config.model) {
        errors.push({
          type: 'missing_required',
          property: 'model',
          message: 'Model selection is required',
          fix: 'Choose a model like "gpt-4", "gpt-3.5-turbo", etc.'
        });
      } else {
        // Check for deprecated models
        const deprecatedModels = ['text-davinci-003', 'text-davinci-002'];
        if (deprecatedModels.includes(config.model)) {
          warnings.push({
            type: 'deprecated',
            property: 'model',
            message: `Model ${config.model} is deprecated`,
            suggestion: 'Use "gpt-3.5-turbo" or "gpt-4" instead'
          });
        }
      }
      
      // Message validation
      if (!config.messages && !config.prompt) {
        errors.push({
          type: 'missing_required',
          property: 'messages',
          message: 'Messages or prompt required for chat completion',
          fix: 'Add messages array or use the prompt field'
        });
      }
      
      // Token limit warnings
      if (config.maxTokens && config.maxTokens > 4000) {
        warnings.push({
          type: 'inefficient',
          property: 'maxTokens',
          message: 'High token limit may increase costs significantly',
          suggestion: 'Consider if you really need more than 4000 tokens'
        });
      }
      
      // Temperature validation
      if (config.temperature !== undefined) {
        if (config.temperature < 0 || config.temperature > 2) {
          errors.push({
            type: 'invalid_value',
            property: 'temperature',
            message: 'Temperature must be between 0 and 2',
            fix: 'Set temperature between 0 (deterministic) and 2 (creative)'
          });
        }
      }
    }
  }
  
  /**
   * Validate MongoDB node configuration
   */
  static validateMongoDB(context: NodeValidationContext): void {
    const { config, errors, warnings } = context;
    const { operation } = config;
    
    // Collection is always required
    if (!config.collection) {
      errors.push({
        type: 'missing_required',
        property: 'collection',
        message: 'Collection name is required',
        fix: 'Specify the MongoDB collection to work with'
      });
    }
    
    switch (operation) {
      case 'find':
        // Query validation
        if (config.query) {
          try {
            JSON.parse(config.query);
          } catch (e) {
            errors.push({
              type: 'invalid_value',
              property: 'query',
              message: 'Query must be valid JSON',
              fix: 'Ensure query is valid JSON like: {"name": "John"}'
            });
          }
        }
        break;
        
      case 'insert':
        if (!config.fields && !config.documents) {
          errors.push({
            type: 'missing_required',
            property: 'fields',
            message: 'Document data is required for insert',
            fix: 'Provide the data to insert'
          });
        }
        break;
        
      case 'update':
        if (!config.query) {
          warnings.push({
            type: 'security',
            message: 'Update without query will affect all documents',
            suggestion: 'Add a query to target specific documents'
          });
        }
        break;
        
      case 'delete':
        if (!config.query || config.query === '{}') {
          errors.push({
            type: 'invalid_value',
            property: 'query',
            message: 'Delete without query would remove all documents - this is a critical security issue',
            fix: 'Add a query to specify which documents to delete'
          });
        }
        break;
    }
  }
}