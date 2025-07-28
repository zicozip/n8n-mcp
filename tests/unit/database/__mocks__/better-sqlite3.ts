import { vi } from 'vitest';

export class MockDatabase {
  private data = new Map<string, any[]>();
  private prepared = new Map<string, any>();
  
  constructor() {
    this.data.set('nodes', []);
    this.data.set('templates', []);
    this.data.set('tools_documentation', []);
  }
  
  prepare(sql: string) {
    const key = this.extractTableName(sql);
    
    return {
      all: vi.fn(() => this.data.get(key) || []),
      get: vi.fn((id: string) => {
        const items = this.data.get(key) || [];
        return items.find(item => item.id === id);
      }),
      run: vi.fn((params: any) => {
        const items = this.data.get(key) || [];
        items.push(params);
        this.data.set(key, items);
        return { changes: 1, lastInsertRowid: items.length };
      })
    };
  }
  
  exec(sql: string) {
    // Mock schema creation
    return true;
  }
  
  close() {
    // Mock close
    return true;
  }
  
  // Helper to extract table name from SQL
  private extractTableName(sql: string): string {
    const match = sql.match(/FROM\s+(\w+)|INTO\s+(\w+)|UPDATE\s+(\w+)/i);
    return match ? (match[1] || match[2] || match[3]) : 'nodes';
  }
  
  // Test helper to seed data
  _seedData(table: string, data: any[]) {
    this.data.set(table, data);
  }
}

export default vi.fn(() => new MockDatabase());