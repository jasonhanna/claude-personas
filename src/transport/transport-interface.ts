/**
 * Transport abstraction layer for agent communication
 * Supports multiple transport mechanisms (HTTP, WebSocket, IPC, etc.)
 */

export interface TransportMessage {
  id: string;
  from: string;
  to: string;
  type: 'request' | 'response' | 'notification';
  content: any;
  timestamp: number;
  correlationId?: string;
  metadata?: Record<string, any>;
}

export interface TransportConfig {
  timeout?: number;
  retries?: number;
  compression?: boolean;
  encryption?: boolean;
}

export interface TransportStats {
  messagesSent: number;
  messagesReceived: number;
  errorsOccurred: number;
  averageLatency: number;
  uptime: number;
}

export abstract class Transport {
  protected config: TransportConfig;
  protected stats: TransportStats;

  constructor(config: TransportConfig = {}) {
    this.config = {
      timeout: 30000,
      retries: 3,
      compression: false,
      encryption: false,
      ...config
    };
    
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      errorsOccurred: 0,
      averageLatency: 0,
      uptime: Date.now()
    };
  }

  /**
   * Initialize the transport connection
   */
  abstract connect(): Promise<void>;

  /**
   * Send a message through this transport
   */
  abstract sendMessage(message: TransportMessage): Promise<void>;

  /**
   * Subscribe to incoming messages
   */
  abstract subscribe(handler: (message: TransportMessage) => void): void;

  /**
   * Unsubscribe from incoming messages
   */
  abstract unsubscribe(handler: (message: TransportMessage) => void): void;

  /**
   * Close the transport connection
   */
  abstract disconnect(): Promise<void>;

  /**
   * Check if transport is connected and healthy
   */
  abstract isHealthy(): Promise<boolean>;

  /**
   * Get transport-specific connection info
   */
  abstract getConnectionInfo(): Record<string, any>;

  /**
   * Get transport statistics
   */
  getStats(): TransportStats {
    return { ...this.stats };
  }

  /**
   * Update transport configuration
   */
  updateConfig(config: Partial<TransportConfig>): void {
    this.config = { ...this.config, ...config };
  }

  protected updateStats(type: 'sent' | 'received' | 'error', latency?: number): void {
    switch (type) {
      case 'sent':
        this.stats.messagesSent++;
        break;
      case 'received':
        this.stats.messagesReceived++;
        break;
      case 'error':
        this.stats.errorsOccurred++;
        break;
    }

    if (latency !== undefined) {
      const totalMessages = this.stats.messagesSent + this.stats.messagesReceived;
      this.stats.averageLatency = (this.stats.averageLatency * (totalMessages - 1) + latency) / totalMessages;
    }
  }
}

/**
 * Transport factory for creating transport instances
 */
export class TransportFactory {
  private static transportTypes = new Map<string, new (config: any) => Transport>();

  static register<T extends Transport>(
    type: string, 
    transportClass: new (config: any) => T
  ): void {
    this.transportTypes.set(type, transportClass);
  }

  static create(type: string, config: any = {}): Transport {
    const TransportClass = this.transportTypes.get(type);
    if (!TransportClass) {
      throw new Error(`Unknown transport type: ${type}`);
    }
    return new TransportClass(config);
  }

  static getSupportedTypes(): string[] {
    return Array.from(this.transportTypes.keys());
  }
}