import { EventEmitter } from 'events';
import { createLogger } from './utils/logger.js';
import ServiceDiscovery, { ServiceEndpoint, HealthCheckResult } from './service-discovery.js';

export interface SystemHealthMetrics {
  timestamp: number;
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    total: number;
    healthy: number;
    unhealthy: number;
    starting: number;
    stopping: number;
  };
  responseTime: {
    average: number;
    p95: number;
    p99: number;
  };
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  errors: HealthError[];
}

export interface HealthError {
  id: string;
  serviceId: string;
  serviceName: string;
  timestamp: number;
  error: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: string; // e.g., "unhealthy_services > 0", "response_time > 5000"
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  cooldownMs: number;
  lastTriggered?: number;
}

export class HealthMonitor extends EventEmitter {
  private serviceDiscovery: ServiceDiscovery;
  private metrics: SystemHealthMetrics[] = [];
  private errors: HealthError[] = [];
  private alertRules: AlertRule[] = [];
  private maxMetricsHistory = 1000; // Keep last 1000 metrics
  private maxErrorsHistory = 500; // Keep last 500 errors
  private monitoringInterval: NodeJS.Timeout | null = null;
  private startTime = Date.now();
  private logger = createLogger('HealthMonitor');

  constructor(serviceDiscovery: ServiceDiscovery) {
    super();
    this.serviceDiscovery = serviceDiscovery;
    this.setupDefaultAlertRules();
    this.setupServiceDiscoveryListeners();
  }

  // Monitoring control
  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      this.stopMonitoring();
    }

    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);

    this.logger.info(`Health monitoring started (interval: ${intervalMs}ms)`);
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.logger.info('Health monitoring stopped');
  }

  // Metrics collection
  async collectMetrics(): Promise<SystemHealthMetrics> {
    try {
      const services = await this.serviceDiscovery.discoverServices();
      const stats = await this.serviceDiscovery.getServiceStats();
      
      // Calculate response times from recent health checks
      const recentHealthChecks = this.getRecentHealthCheckResults();
      const responseTimes = recentHealthChecks
        .filter(result => result.responseTime !== undefined)
        .map(result => result.responseTime!)
        .sort((a, b) => a - b);

      const responseTime = {
        average: responseTimes.length > 0 
          ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
          : 0,
        p95: responseTimes.length > 0 
          ? responseTimes[Math.floor(responseTimes.length * 0.95)] || 0
          : 0,
        p99: responseTimes.length > 0 
          ? responseTimes[Math.floor(responseTimes.length * 0.99)] || 0
          : 0
      };

      // Get memory usage
      const memoryUsage = process.memoryUsage();
      const memory = {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
      };

      // Determine overall health
      let overall: SystemHealthMetrics['overall'] = 'healthy';
      if (stats.unhealthy > 0) {
        if (stats.unhealthy >= stats.total / 2) {
          overall = 'unhealthy';
        } else {
          overall = 'degraded';
        }
      }

      const metrics: SystemHealthMetrics = {
        timestamp: Date.now(),
        overall,
        services: {
          total: stats.total,
          healthy: stats.healthy,
          unhealthy: stats.unhealthy,
          starting: stats.byStatus.starting || 0,
          stopping: stats.byStatus.stopping || 0
        },
        responseTime,
        uptime: Date.now() - this.startTime,
        memory,
        errors: this.getActiveErrors()
      };

      // Store metrics
      this.metrics.push(metrics);
      if (this.metrics.length > this.maxMetricsHistory) {
        this.metrics = this.metrics.slice(-this.maxMetricsHistory);
      }

      // Check alert rules
      this.checkAlertRules(metrics);

      this.emit('metrics-collected', metrics);
      return metrics;

    } catch (error: any) {
      this.logger.error('Error collecting metrics:', error.message);
      throw error;
    }
  }

  // Error management
  addError(serviceId: string, serviceName: string, error: string, severity: HealthError['severity'] = 'medium'): string {
    const errorId = `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const healthError: HealthError = {
      id: errorId,
      serviceId,
      serviceName,
      timestamp: Date.now(),
      error,
      severity,
      resolved: false
    };

    this.errors.push(healthError);
    if (this.errors.length > this.maxErrorsHistory) {
      this.errors = this.errors.slice(-this.maxErrorsHistory);
    }

    this.emit('error-added', healthError);
    this.logger.error(`Health error (${severity}): ${serviceName} - ${error}`);
    
    return errorId;
  }

  resolveError(errorId: string): boolean {
    const error = this.errors.find(e => e.id === errorId);
    if (!error) {
      return false;
    }

    error.resolved = true;
    this.emit('error-resolved', error);
    this.logger.info(`Health error resolved: ${error.serviceName} - ${error.error}`);
    
    return true;
  }

  getActiveErrors(): HealthError[] {
    return this.errors.filter(error => !error.resolved);
  }

  getErrorHistory(limit: number = 100): HealthError[] {
    return this.errors
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // Alert rules management
  addAlertRule(rule: Omit<AlertRule, 'id'>): string {
    const id = `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const alertRule: AlertRule = {
      ...rule,
      id
    };

    this.alertRules.push(alertRule);
    this.logger.debug(`Alert rule added: ${rule.name}`);
    
    return id;
  }

  removeAlertRule(ruleId: string): boolean {
    const index = this.alertRules.findIndex(rule => rule.id === ruleId);
    if (index === -1) {
      return false;
    }

    const rule = this.alertRules[index];
    this.alertRules.splice(index, 1);
    
    this.logger.debug(`Alert rule removed: ${rule.name}`);
    return true;
  }

  getAlertRules(): AlertRule[] {
    return [...this.alertRules];
  }

  // Dashboard data
  async getDashboardData(): Promise<{
    current: SystemHealthMetrics;
    history: SystemHealthMetrics[];
    errors: HealthError[];
    services: ServiceEndpoint[];
    alerts: AlertRule[];
  }> {
    const current = await this.collectMetrics();
    const services = await this.serviceDiscovery.discoverServices();
    
    return {
      current,
      history: this.metrics.slice(-100), // Last 100 metrics
      errors: this.getErrorHistory(50),
      services,
      alerts: this.alertRules
    };
  }

  // Private methods
  private setupDefaultAlertRules(): void {
    const defaultRules: Omit<AlertRule, 'id'>[] = [
      {
        name: 'High Unhealthy Services',
        condition: 'unhealthy_services > 0',
        severity: 'high',
        enabled: true,
        cooldownMs: 300000 // 5 minutes
      },
      {
        name: 'High Response Time',
        condition: 'response_time_p95 > 5000',
        severity: 'medium',
        enabled: true,
        cooldownMs: 600000 // 10 minutes
      },
      {
        name: 'High Memory Usage',
        condition: 'memory_percentage > 90',
        severity: 'high',
        enabled: true,
        cooldownMs: 300000 // 5 minutes
      },
      {
        name: 'System Unhealthy',
        condition: 'overall_status == "unhealthy"',
        severity: 'critical',
        enabled: true,
        cooldownMs: 180000 // 3 minutes
      }
    ];

    for (const rule of defaultRules) {
      this.addAlertRule(rule);
    }
  }

  private setupServiceDiscoveryListeners(): void {
    this.serviceDiscovery.on('service-status-changed', (event) => {
      const { service, oldStatus, newStatus } = event;
      
      if (newStatus === 'unhealthy') {
        this.addError(
          service.id,
          service.name,
          `Service became unhealthy (was ${oldStatus})`,
          'high'
        );
      }
    });

    this.serviceDiscovery.on('health-check-result', (result: HealthCheckResult) => {
      if (result.status === 'unhealthy' && result.error) {
        const service = this.serviceDiscovery.getService(result.serviceId);
        service.then(s => {
          if (s) {
            this.addError(
              result.serviceId,
              s.name,
              result.error!,
              'medium'
            );
          }
        });
      }
    });
  }

  private checkAlertRules(metrics: SystemHealthMetrics): void {
    const now = Date.now();
    
    for (const rule of this.alertRules) {
      if (!rule.enabled) {
        continue;
      }

      // Check cooldown
      if (rule.lastTriggered && (now - rule.lastTriggered) < rule.cooldownMs) {
        continue;
      }

      // Evaluate condition
      if (this.evaluateCondition(rule.condition, metrics)) {
        rule.lastTriggered = now;
        
        this.emit('alert-triggered', {
          rule,
          metrics,
          timestamp: now
        });

        console.warn(`[${new Date().toISOString()}] ALERT (${rule.severity}): ${rule.name}`);
      }
    }
  }

  private evaluateCondition(condition: string, metrics: SystemHealthMetrics): boolean {
    try {
      // Simple condition evaluation
      // Replace variables with actual values
      let evaluatedCondition = condition
        .replace(/unhealthy_services/g, metrics.services.unhealthy.toString())
        .replace(/healthy_services/g, metrics.services.healthy.toString())
        .replace(/total_services/g, metrics.services.total.toString())
        .replace(/response_time_avg/g, metrics.responseTime.average.toString())
        .replace(/response_time_p95/g, metrics.responseTime.p95.toString())
        .replace(/response_time_p99/g, metrics.responseTime.p99.toString())
        .replace(/memory_percentage/g, metrics.memory.percentage.toString())
        .replace(/overall_status/g, `"${metrics.overall}"`)
        .replace(/==/g, '===');

      // Basic safety check - only allow safe expressions
      if (!/^[\d\s+\-*/()><!=.="a-zA-Z_]+$/.test(evaluatedCondition)) {
        console.warn(`[HealthMonitor] Unsafe condition: ${condition}`);
        return false;
      }

      return Function(`"use strict"; return (${evaluatedCondition});`)();
    } catch (error) {
      console.warn(`[HealthMonitor] Error evaluating condition "${condition}":`, error);
      return false;
    }
  }

  private getRecentHealthCheckResults(): HealthCheckResult[] {
    // This would need to be implemented to store recent health check results
    // For now, return empty array
    return [];
  }

  async shutdown(): Promise<void> {
    this.stopMonitoring();
    this.removeAllListeners();
    this.logger.info('Shutdown completed');
  }
}

export default HealthMonitor;