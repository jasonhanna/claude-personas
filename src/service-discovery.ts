import { EventEmitter } from 'events';
import { createLogger } from './utils/logger.js';
import { createHash } from 'crypto';

export interface ServiceEndpoint {
  id: string;
  name: string;
  type: 'global' | 'project' | 'management' | 'global-persona-server';
  host: string;
  port: number;
  status: 'healthy' | 'unhealthy' | 'starting' | 'stopping';
  metadata: {
    persona?: string;
    projectHash?: string;
    workingDirectory?: string;
    version?: string;
    startTime: number;
    lastSeen: number;
  };
  healthEndpoint?: string;
  tags: string[];
}

export interface ServiceFilter {
  type?: ServiceEndpoint['type'];
  persona?: string;
  projectHash?: string;
  status?: ServiceEndpoint['status'];
  tags?: string[];
}

export interface HealthCheckResult {
  serviceId: string;
  status: 'healthy' | 'unhealthy';
  timestamp: number;
  responseTime?: number;
  error?: string;
  details?: any;
}

export class ServiceDiscovery extends EventEmitter {
  private services = new Map<string, ServiceEndpoint>();
  private healthChecks = new Map<string, NodeJS.Timeout>();
  private healthCheckInterval = 30000; // 30 seconds
  private serviceTimeout = 90000; // 90 seconds
  private cleanupInterval: NodeJS.Timeout | null = null;
  private logger = createLogger('ServiceDiscovery');
  private authService?: any; // Will be set via setAuthService

  constructor() {
    super();
    this.startCleanupProcess();
  }

  // Set auth service for health checks
  setAuthService(authService: any): void {
    this.authService = authService;
  }

  // Service registration
  async registerService(endpoint: Omit<ServiceEndpoint, 'id'>): Promise<string> {
    const id = this.generateServiceId(endpoint);
    
    const service: ServiceEndpoint = {
      ...endpoint,
      id,
      metadata: {
        ...endpoint.metadata,
        lastSeen: Date.now()
      }
    };

    const wasRegistered = this.services.has(id);
    this.services.set(id, service);

    // Start health monitoring
    this.startHealthCheck(service);

    const event = wasRegistered ? 'service-updated' : 'service-registered';
    this.emit(event, service);

    this.logger.info(`Service ${event}: ${service.name} (${id})`);
    return id;
  }

  async unregisterService(serviceId: string): Promise<boolean> {
    const service = this.services.get(serviceId);
    if (!service) {
      return false;
    }

    this.services.delete(serviceId);
    this.stopHealthCheck(serviceId);

    this.emit('service-unregistered', service);
    this.logger.info(`Service unregistered: ${service.name} (${serviceId})`);
    return true;
  }

  // Service discovery
  async discoverServices(filter?: ServiceFilter): Promise<ServiceEndpoint[]> {
    let services = Array.from(this.services.values());

    if (!filter) {
      return services;
    }

    // Apply filters
    if (filter.type) {
      services = services.filter(s => s.type === filter.type);
    }

    if (filter.persona) {
      services = services.filter(s => s.metadata.persona === filter.persona);
    }

    if (filter.projectHash) {
      services = services.filter(s => s.metadata.projectHash === filter.projectHash);
    }

    if (filter.status) {
      services = services.filter(s => s.status === filter.status);
    }

    if (filter.tags && filter.tags.length > 0) {
      services = services.filter(s => 
        filter.tags!.some(tag => s.tags.includes(tag))
      );
    }

    return services;
  }

  async getService(serviceId: string): Promise<ServiceEndpoint | null> {
    return this.services.get(serviceId) || null;
  }

  async getServiceByName(name: string): Promise<ServiceEndpoint | null> {
    for (const service of this.services.values()) {
      if (service.name === name) {
        return service;
      }
    }
    return null;
  }

  // Health monitoring
  async performHealthCheck(service: ServiceEndpoint): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      if (!service.healthEndpoint) {
        // No health endpoint, assume healthy if recently seen
        const isRecent = (Date.now() - service.metadata.lastSeen) < this.serviceTimeout;
        return {
          serviceId: service.id,
          status: isRecent ? 'healthy' : 'unhealthy',
          timestamp: Date.now(),
          responseTime: 0
        };
      }

      // Prepare headers with authentication for services that require it
      const headers: HeadersInit = {};
      
      // Add authentication for global persona servers
      if (service.type === 'global-persona-server' && this.authService) {
        try {
          // Get a development token for the health monitor
          const devTokens = this.authService.getDevelopmentTokens();
          // Use the first available token (could be improved to use a specific health monitor token)
          const token = Object.values(devTokens)[0];
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
            console.log(`[ServiceDiscovery] Using auth token for ${service.name} health check`);
          } else {
            console.warn(`[ServiceDiscovery] No auth tokens available for ${service.name} health check`);
          }
        } catch (error) {
          console.warn(`[ServiceDiscovery] Could not get auth token for health check: ${error}`);
        }
      }

      // Perform HTTP health check with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(service.healthEndpoint, {
        method: 'GET',
        headers,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      const responseTime = Date.now() - startTime;
      const isHealthy = response.ok;

      let details;
      try {
        details = await response.json();
      } catch {
        // Ignore JSON parse errors
      }

      return {
        serviceId: service.id,
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: Date.now(),
        responseTime,
        details
      };

    } catch (error: any) {
      return {
        serviceId: service.id,
        status: 'unhealthy',
        timestamp: Date.now(),
        responseTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  // Service mesh capabilities
  async findHealthyService(filter: ServiceFilter): Promise<ServiceEndpoint | null> {
    const services = await this.discoverServices({
      ...filter,
      status: 'healthy'
    });

    if (services.length === 0) {
      return null;
    }

    // Simple round-robin selection
    return services[Math.floor(Math.random() * services.length)];
  }

  async findFailoverService(failedServiceId: string): Promise<ServiceEndpoint | null> {
    const failedService = await this.getService(failedServiceId);
    if (!failedService) {
      return null;
    }

    // Find a healthy service of the same type and persona
    return this.findHealthyService({
      type: failedService.type,
      persona: failedService.metadata.persona,
      projectHash: failedService.metadata.projectHash
    });
  }

  // Statistics and monitoring
  async getServiceStats(): Promise<{
    total: number;
    healthy: number;
    unhealthy: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
  }> {
    const services = Array.from(this.services.values());
    
    const stats = {
      total: services.length,
      healthy: services.filter(s => s.status === 'healthy').length,
      unhealthy: services.filter(s => s.status === 'unhealthy').length,
      byType: {} as Record<string, number>,
      byStatus: {} as Record<string, number>
    };

    // Count by type
    for (const service of services) {
      stats.byType[service.type] = (stats.byType[service.type] || 0) + 1;
      stats.byStatus[service.status] = (stats.byStatus[service.status] || 0) + 1;
    }

    return stats;
  }

  // Heartbeat handling
  async updateServiceHeartbeat(serviceId: string, metadata?: Partial<ServiceEndpoint['metadata']>): Promise<boolean> {
    const service = this.services.get(serviceId);
    if (!service) {
      return false;
    }

    service.metadata.lastSeen = Date.now();
    if (metadata) {
      Object.assign(service.metadata, metadata);
    }

    this.emit('service-heartbeat', service);
    return true;
  }

  // Private methods
  private generateServiceId(endpoint: Omit<ServiceEndpoint, 'id'>): string {
    const key = `${endpoint.type}-${endpoint.name}-${endpoint.host}-${endpoint.port}`;
    return createHash('sha256').update(key).digest('hex').substring(0, 16);
  }

  private startHealthCheck(service: ServiceEndpoint): void {
    // Clear existing health check
    this.stopHealthCheck(service.id);

    const healthCheck = setInterval(async () => {
      const result = await this.performHealthCheck(service);
      
      // Update service status and lastSeen
      const updatedStatus = result.status;
      
      // Update lastSeen timestamp on successful health check
      if (updatedStatus === 'healthy') {
        service.metadata.lastSeen = Date.now();
      }
      
      if (service.status !== updatedStatus) {
        const oldStatus = service.status;
        service.status = updatedStatus;
        
        this.emit('service-status-changed', {
          service,
          oldStatus,
          newStatus: updatedStatus,
          healthResult: result
        });

        this.logger.info(`Service ${service.name} status: ${oldStatus} → ${updatedStatus}`);
      }

      this.emit('health-check-result', result);
    }, this.healthCheckInterval);

    this.healthChecks.set(service.id, healthCheck);
  }

  private stopHealthCheck(serviceId: string): void {
    const healthCheck = this.healthChecks.get(serviceId);
    if (healthCheck) {
      clearInterval(healthCheck);
      this.healthChecks.delete(serviceId);
    }
  }

  private startCleanupProcess(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleServices();
    }, 60000); // Run every minute
  }

  private cleanupStaleServices(): void {
    const now = Date.now();
    const staleServices: string[] = [];

    for (const [id, service] of this.services) {
      const timeSinceLastSeen = now - service.metadata.lastSeen;
      
      if (timeSinceLastSeen > this.serviceTimeout) {
        staleServices.push(id);
      }
    }

    for (const serviceId of staleServices) {
      this.logger.debug(`Removing stale service: ${serviceId}`);
      this.unregisterService(serviceId);
    }
  }

  async shutdown(): Promise<void> {
    // Clear all health checks
    for (const healthCheck of this.healthChecks.values()) {
      clearInterval(healthCheck);
    }
    this.healthChecks.clear();

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Clear all services
    this.services.clear();

    this.emit('shutdown');
    this.logger.info('Shutdown completed');
  }
}

export default ServiceDiscovery;