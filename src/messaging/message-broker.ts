/**
 * Enhanced message broker with SQLite persistence and multiple transport support
 * Extracted and enhanced from AgentCore
 */

import { Transport, TransportMessage } from '../transport/transport-interface.js';
import { ValidationError, CommunicationError, MemoryError } from '../errors.js';
import { ResourceRegistry } from '../resource-registry.js';
import { createLogger } from '../utils/logger.js';
import sqlite3 from 'sqlite3';
const { Database } = sqlite3;
import { promisify } from 'util';
import * as crypto from 'crypto';

export interface BrokerMessage {
  id: string;
  from: string;
  to: string;
  type: 'request' | 'response' | 'notification';
  content: any;
  timestamp: number;
  correlationId?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  retryCount: number;
  maxRetries: number;
  metadata?: Record<string, any>;
}

export interface MessageOptions {
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  timeout?: number;
  retries?: number;
  correlationId?: string;
  metadata?: Record<string, any>;
}

export interface BrokerConfig {
  dbPath: string;
  defaultTimeout: number;
  defaultRetries: number;
  batchSize: number;
  cleanupInterval: number;
  messageRetention: number; // in milliseconds
  agentId?: string; // Agent identifier for message attribution
}

export interface BrokerDependencies {
  database?: any; // Can be sqlite3.Database or mock
  timer?: typeof setInterval;
  crypto?: typeof crypto;
}

export class MessageBroker {
  private db: any;
  private dbRun: (sql: string, params?: any[]) => Promise<void>;
  private dbGet: (sql: string, params?: any[]) => Promise<any>;
  private dbAll: (sql: string, params?: any[]) => Promise<any[]>;
  
  private transports = new Map<string, Transport>();
  private handlers = new Map<string, (message: BrokerMessage) => Promise<void>>();
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  
  private config: BrokerConfig;
  private deps: BrokerDependencies;
  private cleanupTimer?: NodeJS.Timeout;
  private isStarted = false;
  private resourceRegistry = new ResourceRegistry('MessageBroker');
  private logger = createLogger('MessageBroker');

  constructor(
    config: Partial<BrokerConfig> = {},
    dependencies: BrokerDependencies = {}
  ) {
    this.config = {
      dbPath: './message-broker.db',
      defaultTimeout: 30000,
      defaultRetries: 3,
      batchSize: 100,
      cleanupInterval: 60000, // 1 minute
      messageRetention: 7 * 24 * 60 * 60 * 1000, // 7 days
      ...config
    };

    this.deps = {
      timer: setInterval,
      crypto,
      ...dependencies
    };

    // Use injected database or create new SQLite instance
    if (dependencies.database) {
      this.db = dependencies.database;
      // For mock databases, use the methods directly
      this.dbRun = this.db.run ? this.db.run.bind(this.db) : this.db.run;
      this.dbGet = this.db.get ? this.db.get.bind(this.db) : this.db.get;
      this.dbAll = this.db.all ? this.db.all.bind(this.db) : this.db.all;
    } else {
      this.db = new Database(this.config.dbPath);
      this.dbRun = promisify(this.db.run.bind(this.db));
      this.dbGet = promisify(this.db.get.bind(this.db));
      this.dbAll = promisify(this.db.all.bind(this.db));
    }
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    try {
      await this.initializeDatabase();
      
      // Register database for cleanup
      this.resourceRegistry.registerResource(
        this.db,
        () => this.closeDatabaseSafely(),
        { name: 'database', component: 'MessageBroker' }
      );
      
      await this.recoverPendingMessages();
      this.startCleanupTimer();
      this.isStarted = true;
    } catch (error) {
      throw new MemoryError('Failed to start message broker', {
        dbPath: this.config.dbPath,
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    const errors: Error[] = [];

    // Stop cleanup timer and wait for any running cleanup to complete
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
      
      // Wait a brief moment to ensure timer callback isn't running
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Clear all pending requests with cleanup timeout errors
    for (const [correlationId, { reject, timeout }] of this.pendingRequests) {
      try {
        clearTimeout(timeout);
        reject(new CommunicationError('Message broker shutting down', { correlationId }));
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    this.pendingRequests.clear();

    // Disconnect all transports with proper error handling
    const transportDisconnectPromises = Array.from(this.transports.entries()).map(
      async ([name, transport]) => {
        try {
          await transport.disconnect();
        } catch (error) {
          errors.push(new CommunicationError(`Failed to disconnect ${name} transport`, {
            transportName: name,
            cause: error instanceof Error ? error.message : String(error)
          }));
        }
      }
    );

    await Promise.allSettled(transportDisconnectPromises);

    // Use ResourceRegistry for comprehensive cleanup
    try {
      await this.resourceRegistry.cleanup();
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    // Clear references
    this.cleanupTimer = undefined;

    this.isStarted = false;

    // If there were errors during shutdown, throw them as an aggregate
    if (errors.length > 0) {
      // Use a simple Error with combined messages for compatibility
      const combinedMessage = `Errors occurred during MessageBroker shutdown: ${errors.map(e => e.message).join('; ')}`;
      throw new Error(combinedMessage);
    }
  }

  registerTransport(name: string, transport: Transport): void {
    this.transports.set(name, transport);
    
    // Subscribe to incoming messages from this transport
    transport.subscribe(async (transportMessage) => {
      try {
        const brokerMessage = this.convertFromTransportMessage(transportMessage);
        await this.handleIncomingMessage(brokerMessage);
      } catch (error) {
        this.logger.error(`Error handling message from transport ${name}:`, error);
      }
    });
  }

  registerHandler(pattern: string, handler: (message: BrokerMessage) => Promise<void>): void {
    this.handlers.set(pattern, handler);
  }

  async sendMessage(
    to: string,
    type: 'notification',
    content: any,
    options: MessageOptions = {}
  ): Promise<void> {
    const message = this.createMessage(to, type, content, options);
    await this.persistMessage(message);
    await this.deliverMessage(message);
  }

  async requestResponse(
    to: string,
    content: any,
    options: MessageOptions = {}
  ): Promise<any> {
    const timeout = options.timeout || this.config.defaultTimeout;
    const correlationId = options.correlationId || this.deps.crypto!.randomUUID();
    
    const message = this.createMessage(to, 'request', content, {
      ...options,
      correlationId
    });

    await this.persistMessage(message);

    return new Promise(async (resolve, reject) => {
      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new CommunicationError('Request timeout', {
          messageId: message.id,
          correlationId,
          timeout
        }));
      }, timeout);

      // Store pending request
      this.pendingRequests.set(correlationId, {
        resolve,
        reject,
        timeout: timeoutHandle
      });

      try {
        await this.deliverMessage(message);
      } catch (error) {
        clearTimeout(timeoutHandle);
        this.pendingRequests.delete(correlationId);
        reject(error);
      }
    });
  }

  async sendResponse(
    originalMessage: BrokerMessage,
    content: any,
    options: MessageOptions = {}
  ): Promise<void> {
    if (!originalMessage.correlationId) {
      throw new ValidationError('Cannot send response to message without correlationId', {
        originalMessageId: originalMessage.id
      });
    }

    const responseMessage = this.createMessage(
      originalMessage.from,
      'response',
      content,
      {
        ...options,
        correlationId: originalMessage.correlationId
      }
    );

    await this.persistMessage(responseMessage);
    await this.deliverMessage(responseMessage);
  }

  private createMessage(
    to: string,
    type: 'request' | 'response' | 'notification',
    content: any,
    options: MessageOptions = {}
  ): BrokerMessage {
    return {
      id: this.deps.crypto!.randomUUID(),
      from: this.config.agentId || 'unknown-agent', // Use configured agent ID
      to,
      type,
      content,
      timestamp: Date.now(),
      correlationId: options.correlationId,
      priority: options.priority || 'normal',
      retryCount: 0,
      maxRetries: options.retries || this.config.defaultRetries,
      metadata: options.metadata || {}
    };
  }

  private async deliverMessage(message: BrokerMessage): Promise<void> {
    // Try each transport until one succeeds
    const transportErrors: Error[] = [];
    
    for (const [name, transport] of this.transports) {
      try {
        const transportMessage = this.convertToTransportMessage(message);
        await transport.sendMessage(transportMessage);
        return; // Success!
      } catch (error) {
        transportErrors.push(error instanceof Error ? error : new Error(String(error)));
        this.logger.warn(`Transport ${name} failed to deliver message:`, error);
      }
    }

    // All transports failed
    if (transportErrors.length > 0) {
      throw new CommunicationError('All transports failed to deliver message', {
        messageId: message.id,
        transportCount: this.transports.size,
        errors: transportErrors.map(e => e.message)
      });
    } else {
      throw new CommunicationError('No transports available', {
        messageId: message.id
      });
    }
  }

  private async handleIncomingMessage(message: BrokerMessage): Promise<void> {
    try {
      await this.persistMessage(message);

      // Handle responses to pending requests
      if (message.type === 'response' && message.correlationId) {
        const pending = this.pendingRequests.get(message.correlationId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(message.correlationId);
          pending.resolve(message.content);
          return;
        }
      }

      // Route to appropriate handler
      for (const [pattern, handler] of this.handlers) {
        if (this.matchesPattern(message, pattern)) {
          try {
            await handler(message);
          } catch (error) {
            this.logger.error(`Handler error for pattern ${pattern}:`, error);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error handling incoming message:', error);
    }
  }

  private matchesPattern(message: BrokerMessage, pattern: string): boolean {
    // Simple pattern matching - can be enhanced later
    if (pattern === '*') return true;
    if (pattern === message.to) return true;
    if (pattern === `${message.from}->${message.to}`) return true;
    return false;
  }

  private convertToTransportMessage(message: BrokerMessage): TransportMessage {
    return {
      id: message.id,
      from: message.from,
      to: message.to,
      type: message.type,
      content: message.content,
      timestamp: message.timestamp,
      correlationId: message.correlationId,
      metadata: {
        ...message.metadata,
        priority: message.priority,
        retryCount: message.retryCount,
        maxRetries: message.maxRetries
      }
    };
  }

  private convertFromTransportMessage(transportMessage: TransportMessage): BrokerMessage {
    return {
      id: transportMessage.id,
      from: transportMessage.from,
      to: transportMessage.to,
      type: transportMessage.type,
      content: transportMessage.content,
      timestamp: transportMessage.timestamp,
      correlationId: transportMessage.correlationId,
      priority: (transportMessage.metadata?.priority as any) || 'normal',
      retryCount: transportMessage.metadata?.retryCount || 0,
      maxRetries: transportMessage.metadata?.maxRetries || this.config.defaultRetries,
      metadata: transportMessage.metadata || {}
    };
  }

  private async initializeDatabase(): Promise<void> {
    const createTable = `
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        from_agent TEXT NOT NULL,
        to_agent TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        correlation_id TEXT,
        priority TEXT NOT NULL,
        retry_count INTEGER NOT NULL,
        max_retries INTEGER NOT NULL,
        metadata TEXT,
        status TEXT DEFAULT 'pending'
      )
    `;

    const createIndex = `
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_messages_correlation_id ON messages(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
    `;

    await this.dbRun(createTable);
    await this.dbRun(createIndex);
  }

  private async persistMessage(message: BrokerMessage): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO messages 
      (id, from_agent, to_agent, type, content, timestamp, correlation_id, priority, retry_count, max_retries, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.dbRun(sql, [
      message.id,
      message.from,
      message.to,
      message.type,
      JSON.stringify(message.content),
      message.timestamp,
      message.correlationId,
      message.priority,
      message.retryCount,
      message.maxRetries,
      JSON.stringify(message.metadata)
    ]);
  }

  private async recoverPendingMessages(): Promise<void> {
    // TODO: Issue #6 - Implement recovery of undelivered messages from database
    this.logger.debug('Message recovery not yet implemented');
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = this.deps.timer!(async () => {
      try {
        await this.cleanupOldMessages();
      } catch (error) {
        this.logger.error('Cleanup error:', error);
      }
    }, this.config.cleanupInterval);

    // Register the timer for proper cleanup
    this.resourceRegistry.registerInterval(this.cleanupTimer, {
      name: 'cleanup',
      component: 'MessageBroker'
    });
  }

  private async cleanupOldMessages(): Promise<void> {
    const cutoff = Date.now() - this.config.messageRetention;
    const sql = 'DELETE FROM messages WHERE timestamp < ? AND status = "delivered"';
    await this.dbRun(sql, [cutoff]);
  }

  private async closeDatabaseSafely(): Promise<void> {
    if (this.db && typeof this.db.close === 'function') {
      return Promise.race([
        new Promise<void>((resolve, reject) => {
          this.db.close((error: any) => {
            if (error) reject(error);
            else resolve();
          });
        }),
        // Timeout database closure after 5 seconds
        new Promise<void>((_, reject) => 
          setTimeout(() => reject(new Error('Database close timeout')), 5000)
        )
      ]);
    }
  }
}