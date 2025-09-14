import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { MetadataGenerator, MetadataRequest, MetadataResult } from './metadata-generator';

export interface BatchProcessorOptions {
  apiKey: string;
  model?: string;
  batchSize?: number;
  outputDir?: string;
}

export interface BatchJob {
  id: string;
  status: 'validating' | 'in_progress' | 'finalizing' | 'completed' | 'failed' | 'expired' | 'cancelled';
  created_at: number;
  completed_at?: number;
  input_file_id: string;
  output_file_id?: string;
  error?: any;
}

export class BatchProcessor {
  private client: OpenAI;
  private generator: MetadataGenerator;
  private batchSize: number;
  private outputDir: string;
  
  constructor(options: BatchProcessorOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.generator = new MetadataGenerator(options.apiKey, options.model);
    this.batchSize = options.batchSize || 100;
    this.outputDir = options.outputDir || './temp';
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }
  
  /**
   * Process templates in batches
   */
  async processTemplates(
    templates: MetadataRequest[],
    progressCallback?: (message: string, current: number, total: number) => void
  ): Promise<Map<number, MetadataResult>> {
    const results = new Map<number, MetadataResult>();
    const batches = this.createBatches(templates);
    
    logger.info(`Processing ${templates.length} templates in ${batches.length} batches`);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNum = i + 1;
      
      try {
        progressCallback?.(`Processing batch ${batchNum}/${batches.length}`, i * this.batchSize, templates.length);
        
        // Process this batch
        const batchResults = await this.processBatch(batch, `batch_${batchNum}`);
        
        // Merge results
        for (const result of batchResults) {
          results.set(result.templateId, result);
        }
        
        logger.info(`Completed batch ${batchNum}/${batches.length}: ${batchResults.length} results`);
        progressCallback?.(`Completed batch ${batchNum}/${batches.length}`, Math.min((i + 1) * this.batchSize, templates.length), templates.length);
      } catch (error) {
        logger.error(`Error processing batch ${batchNum}:`, error);
        // Continue with next batch
      }
    }
    
    logger.info(`Batch processing complete: ${results.size} results`);
    return results;
  }
  
  /**
   * Process a single batch
   */
  private async processBatch(templates: MetadataRequest[], batchName: string): Promise<MetadataResult[]> {
    // Create JSONL file
    const inputFile = await this.createBatchFile(templates, batchName);
    
    try {
      // Upload file to OpenAI
      const uploadedFile = await this.uploadFile(inputFile);
      
      // Create batch job
      const batchJob = await this.createBatchJob(uploadedFile.id);
      
      // Monitor job until completion
      const completedJob = await this.monitorBatchJob(batchJob.id);
      
      // Retrieve and parse results
      const results = await this.retrieveResults(completedJob);
      
      // Cleanup
      await this.cleanup(inputFile, uploadedFile.id, completedJob.output_file_id);
      
      return results;
    } catch (error) {
      // Cleanup on error
      try {
        fs.unlinkSync(inputFile);
      } catch {}
      throw error;
    }
  }
  
  /**
   * Create batches from templates
   */
  private createBatches(templates: MetadataRequest[]): MetadataRequest[][] {
    const batches: MetadataRequest[][] = [];
    
    for (let i = 0; i < templates.length; i += this.batchSize) {
      batches.push(templates.slice(i, i + this.batchSize));
    }
    
    return batches;
  }
  
  /**
   * Create JSONL batch file
   */
  private async createBatchFile(templates: MetadataRequest[], batchName: string): Promise<string> {
    const filename = path.join(this.outputDir, `${batchName}_${Date.now()}.jsonl`);
    const stream = fs.createWriteStream(filename);
    
    for (const template of templates) {
      const request = this.generator.createBatchRequest(template);
      stream.write(JSON.stringify(request) + '\n');
    }
    
    stream.end();
    
    // Wait for stream to finish
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });
    
    logger.debug(`Created batch file: ${filename} with ${templates.length} requests`);
    return filename;
  }
  
  /**
   * Upload file to OpenAI
   */
  private async uploadFile(filepath: string): Promise<any> {
    const file = fs.createReadStream(filepath);
    const uploadedFile = await this.client.files.create({
      file,
      purpose: 'batch'
    });
    
    logger.debug(`Uploaded file: ${uploadedFile.id}`);
    return uploadedFile;
  }
  
  /**
   * Create batch job
   */
  private async createBatchJob(fileId: string): Promise<any> {
    const batchJob = await this.client.batches.create({
      input_file_id: fileId,
      endpoint: '/v1/chat/completions',
      completion_window: '24h'
    });
    
    logger.info(`Created batch job: ${batchJob.id}`);
    return batchJob;
  }
  
  /**
   * Monitor batch job with exponential backoff
   */
  private async monitorBatchJob(batchId: string): Promise<any> {
    const waitTimes = [60, 120, 300, 600, 900, 1800]; // Progressive wait times in seconds
    let waitIndex = 0;
    let attempts = 0;
    const maxAttempts = 100; // Safety limit
    
    while (attempts < maxAttempts) {
      const batchJob = await this.client.batches.retrieve(batchId);
      
      logger.debug(`Batch ${batchId} status: ${batchJob.status} (attempt ${attempts + 1})`);
      
      if (batchJob.status === 'completed') {
        logger.info(`Batch job ${batchId} completed successfully`);
        return batchJob;
      }
      
      if (['failed', 'expired', 'cancelled'].includes(batchJob.status)) {
        throw new Error(`Batch job failed with status: ${batchJob.status}`);
      }
      
      // Wait before next check
      const waitTime = waitTimes[Math.min(waitIndex, waitTimes.length - 1)];
      logger.debug(`Waiting ${waitTime} seconds before next check...`);
      await this.sleep(waitTime * 1000);
      
      waitIndex = Math.min(waitIndex + 1, waitTimes.length - 1);
      attempts++;
    }
    
    throw new Error(`Batch job monitoring timed out after ${maxAttempts} attempts`);
  }
  
  /**
   * Retrieve and parse results
   */
  private async retrieveResults(batchJob: any): Promise<MetadataResult[]> {
    if (!batchJob.output_file_id) {
      throw new Error('No output file available for batch job');
    }
    
    // Download result file
    const fileResponse = await this.client.files.content(batchJob.output_file_id);
    const fileContent = await fileResponse.text();
    
    // Parse JSONL results
    const results: MetadataResult[] = [];
    const lines = fileContent.trim().split('\n');
    
    for (const line of lines) {
      if (!line) continue;
      
      try {
        const result = JSON.parse(line);
        const parsed = this.generator.parseResult(result);
        results.push(parsed);
      } catch (error) {
        logger.error('Error parsing result line:', error);
      }
    }
    
    logger.info(`Retrieved ${results.length} results from batch job`);
    return results;
  }
  
  /**
   * Cleanup temporary files
   */
  private async cleanup(localFile: string, inputFileId: string, outputFileId?: string): Promise<void> {
    // Delete local file
    try {
      fs.unlinkSync(localFile);
      logger.debug(`Deleted local file: ${localFile}`);
    } catch (error) {
      logger.warn(`Failed to delete local file: ${localFile}`, error);
    }
    
    // Delete uploaded files from OpenAI
    try {
      await this.client.files.del(inputFileId);
      logger.debug(`Deleted input file from OpenAI: ${inputFileId}`);
    } catch (error) {
      logger.warn(`Failed to delete input file from OpenAI: ${inputFileId}`, error);
    }
    
    if (outputFileId) {
      try {
        await this.client.files.del(outputFileId);
        logger.debug(`Deleted output file from OpenAI: ${outputFileId}`);
      } catch (error) {
        logger.warn(`Failed to delete output file from OpenAI: ${outputFileId}`, error);
      }
    }
  }
  
  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}