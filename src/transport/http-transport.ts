/**
 * HTTP-based transport implementation
 * Uses HTTP requests for agent-to-agent communication
 */

import { Transport, TransportMessage, TransportConfig } from './transport-interface.js';
import { ValidationError, CommunicationError } from '../errors.js';

export interface HttpTransportConfig extends TransportConfig {
  baseUrl?: string;
  port?: number;
  headers?: Record<string, string>;
  pollInterval?: number;
  authToken?: string;
}

export class HttpTransport extends Transport {
  private handlers: Set<(message: TransportMessage) => void> = new Set();
  private pollTimer?: NodeJS.Timeout;
  private lastPollTime: number = 0;
  private httpConfig: HttpTransportConfig;

  constructor(config: HttpTransportConfig = {}) {
    super(config);
    this.httpConfig = {
      baseUrl: 'http://localhost',
      port: 3000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MultiAgent-Framework/1.0'
      },
      pollInterval: 1000,
      ...config
    };
  }

  async connect(): Promise<void> {
    try {
      // Test connection with health check
      const response = await this.makeRequest('GET', '/health');
      if (!response.ok) {
        throw new CommunicationError(`Health check failed: ${response.status}`, {
          transportType: 'http',
          baseUrl: this.httpConfig.baseUrl,
          port: this.httpConfig.port
        });
      }

      // Start polling for messages if we have handlers
      if (this.handlers.size > 0) {
        this.startPolling();
      }
    } catch (error) {
      throw new CommunicationError('Failed to connect HTTP transport', {
        transportType: 'http',
        baseUrl: this.httpConfig.baseUrl,
        port: this.httpConfig.port,
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async sendMessage(message: TransportMessage): Promise<void> {
    if (!message.to) {
      throw new ValidationError('Message must have a recipient', { message });
    }

    const startTime = Date.now();
    
    try {
      const response = await this.makeRequest('POST', '/mcp/message', {
        body: JSON.stringify(message),
        headers: {
          ...this.httpConfig.headers,
          'X-Message-Id': message.id,
          'X-Correlation-Id': message.correlationId || message.id
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new CommunicationError(`HTTP ${response.status}: ${errorText}`, {
          transportType: 'http',
          messageId: message.id,
          recipient: message.to,
          statusCode: response.status
        });
      }

      const latency = Date.now() - startTime;
      this.updateStats('sent', latency);

    } catch (error) {
      this.updateStats('error');
      
      if (error instanceof CommunicationError) {
        throw error;
      }
      
      throw new CommunicationError('Failed to send HTTP message', {
        transportType: 'http',
        messageId: message.id,
        recipient: message.to,
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  }

  subscribe(handler: (message: TransportMessage) => void): void {
    this.handlers.add(handler);
    
    // Start polling if this is the first handler
    if (this.handlers.size === 1 && !this.pollTimer) {
      this.startPolling();
    }
  }

  unsubscribe(handler: (message: TransportMessage) => void): void {
    this.handlers.delete(handler);
    
    // Stop polling if no more handlers
    if (this.handlers.size === 0 && this.pollTimer) {
      this.stopPolling();
    }
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    this.handlers.clear();
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.makeRequest('GET', '/health', { timeout: 5000 });
      return response.ok;
    } catch {
      return false;
    }
  }

  getConnectionInfo(): Record<string, any> {
    return {
      type: 'http',
      baseUrl: this.httpConfig.baseUrl,
      port: this.httpConfig.port,
      pollInterval: this.httpConfig.pollInterval,
      handlersCount: this.handlers.size,
      isPolling: !!this.pollTimer
    };
  }

  setAuthToken(token: string): void {
    this.httpConfig.authToken = token;
  }

  private async makeRequest(method: string, path: string, options: {
    body?: string;
    headers?: Record<string, string>;
    timeout?: number;
  } = {}): Promise<Response> {
    const url = `${this.httpConfig.baseUrl}:${this.httpConfig.port}${path}`;
    const timeout = options.timeout || this.config.timeout || 30000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        ...this.httpConfig.headers,
        ...options.headers
      };
      
      // Add auth token if available
      if (this.httpConfig.authToken) {
        headers['Authorization'] = `Bearer ${this.httpConfig.authToken}`;
      }
      
      const response = await fetch(url, {
        method,
        body: options.body,
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private startPolling(): void {
    if (this.pollTimer) {
      return;
    }

    this.pollTimer = setInterval(async () => {
      try {
        await this.pollForMessages();
      } catch (error) {
        this.updateStats('error');
        // Log error but don't stop polling
        console.error('HTTP transport polling error:', error);
      }
    }, this.httpConfig.pollInterval);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private async pollForMessages(): Promise<void> {
    const since = this.lastPollTime;
    this.lastPollTime = Date.now();

    try {
      const response = await this.makeRequest('GET', `/mcp/messages?since=${since}`, {
        timeout: 5000
      });

      if (!response.ok) {
        return; // Skip this poll cycle
      }

      const data = await response.json();
      const messages = data.messages || [];

      for (const messageData of messages) {
        try {
          const message = this.validateMessage(messageData);
          this.updateStats('received');
          
          // Notify all handlers
          this.handlers.forEach(handler => {
            try {
              handler(message);
            } catch (error) {
              console.error('Message handler error:', error);
            }
          });
        } catch (error) {
          console.error('Invalid message received:', error);
        }
      }
    } catch (error) {
      // Polling errors are logged but don't interrupt the cycle
      throw error;
    }
  }

  private validateMessage(data: any): TransportMessage {
    if (!data || typeof data !== 'object') {
      throw new ValidationError('Message must be an object', { data });
    }

    const required = ['id', 'from', 'to', 'type', 'content', 'timestamp'];
    for (const field of required) {
      if (!(field in data)) {
        throw new ValidationError(`Message missing required field: ${field}`, { data });
      }
    }

    if (!['request', 'response', 'notification'].includes(data.type)) {
      throw new ValidationError('Invalid message type', { data });
    }

    return {
      id: String(data.id),
      from: String(data.from),
      to: String(data.to),
      type: data.type,
      content: data.content,
      timestamp: Number(data.timestamp),
      correlationId: data.correlationId ? String(data.correlationId) : undefined,
      metadata: data.metadata || {}
    };
  }
}