import { z } from 'zod';

// Base validation schemas
export const PersonaConfigSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  role: z.string().min(1, 'Role is required').max(50, 'Role must be less than 50 characters').regex(/^[a-z][a-z0-9-]*$/, 'Role must be lowercase alphanumeric with hyphens'),
  responsibilities: z.array(z.string()).optional().default([]),
  initial_memories: z.array(z.string()).optional().default([]),
  tools: z.array(z.string()).optional().default([]),
  communication_style: z.object({
    tone: z.enum(['professional', 'casual', 'formal']).optional().default('professional'),
    focus: z.enum(['general', 'technical', 'business']).optional().default('general')
  }).optional().default({ tone: 'professional', focus: 'general' })
});

export const PersonaUpdateSchema = PersonaConfigSchema.partial().omit({ role: true });

export const ProjectSessionSchema = z.object({
  projectHash: z.string().min(1, 'Project hash is required').max(64, 'Project hash too long'),
  workingDirectory: z.string().min(1, 'Working directory is required'),
  pid: z.number().int().positive('PID must be a positive integer')
});

export const ProjectAgentSchema = z.object({
  projectHash: z.string().min(1, 'Project hash is required').max(64, 'Project hash too long'),
  persona: z.string().min(1, 'Persona is required').max(50, 'Persona name too long'),
  port: z.number().int().min(1024, 'Port must be >= 1024').max(65535, 'Port must be <= 65535'),
  workingDirectory: z.string().min(1, 'Working directory is required'),
  pid: z.number().int().positive('PID must be a positive integer')
});

export const AgentHeartbeatSchema = z.object({
  pid: z.number().int().positive('PID must be a positive integer').optional()
});

export const PortAllocationSchema = z.object({
  projectHash: z.string().max(64, 'Project hash too long').optional(),
  persona: z.string().max(50, 'Persona name too long').optional()
});

export const PortReleaseSchema = z.object({
  port: z.number().int().min(1024, 'Port must be >= 1024').max(65535, 'Port must be <= 65535')
});

// Validation middleware function
export function validateRequest<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    try {
      const validatedData = schema.parse(req.body);
      req.validatedBody = validatedData;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }
      next(error);
    }
  };
}

// Path parameter validation
export function validatePathParam(paramName: string, schema: z.ZodSchema) {
  return (req: any, res: any, next: any) => {
    try {
      const value = req.params[paramName];
      const validatedValue = schema.parse(value);
      req.params[paramName] = validatedValue;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: `Invalid ${paramName} parameter`,
          code: 'VALIDATION_ERROR',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }
      next(error);
    }
  };
}

// Common path parameter schemas
export const IdParamSchema = z.string().min(1, 'ID is required').max(50, 'ID too long');
export const HashParamSchema = z.string().min(1, 'Hash is required').max(64, 'Hash too long');
export const SessionIdParamSchema = z.string().min(1, 'Session ID is required').max(100, 'Session ID too long');
export const PortParamSchema = z.string().regex(/^\d+$/, 'Port must be a number').transform(val => parseInt(val)).pipe(z.number().int().min(1024).max(65535));