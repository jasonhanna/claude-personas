import { ValidationError, ConfigurationError } from './errors.js';

export interface RetryStrategy {
  name: string;
  shouldRetry: (error: Error, attempt: number) => boolean;
  getAlternativeArgs: (originalArgs: any, error: Error, attempt: number) => any[];
  maxAttempts: number;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  strategies: string[];
}

export class IntelligentRetrySystem {
  private strategies: Map<string, RetryStrategy[]> = new Map();

  constructor() {
    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    // Bash command retry strategies
    this.strategies.set('Bash', [
      {
        name: 'github-cli-repo-format',
        shouldRetry: (error: Error) => 
          error.message.includes('expected the "[HOST/]OWNER/REPO" format') ||
          error.message.includes('got "."'),
        getAlternativeArgs: (originalArgs, error, attempt) => {
          if (attempt === 1) {
            // First retry: remove --repo flag entirely
            const newCommand = originalArgs.command.replace(/--repo\s+\S+\s*/, '');
            return [{ ...originalArgs, command: newCommand }];
          }
          if (attempt === 2) {
            // Second retry: try to detect repo from git remote
            return [{ 
              ...originalArgs, 
              command: 'git remote -v | head -1 | sed "s/.*github.com[:/]\\([^/]*\\)\\/\\([^.]*\\).*/\\1\\/\\2/" | xargs -I {} ' + 
                       originalArgs.command.replace(/--repo\s+\S+/, '--repo {}')
            }];
          }
          return [];
        },
        maxAttempts: 3
      },
      {
        name: 'permission-denied',
        shouldRetry: (error: Error) => 
          error.message.includes('Permission denied') || 
          error.message.includes('EACCES'),
        getAlternativeArgs: (originalArgs, error, attempt) => {
          if (attempt === 1) {
            // Try with explicit path resolution
            return [{ 
              ...originalArgs, 
              command: `cd "${process.cwd()}" && ${originalArgs.command}`
            }];
          }
          return [];
        },
        maxAttempts: 2
      },
      {
        name: 'command-not-found',
        shouldRetry: (error: Error) => 
          error.message.includes('command not found') ||
          error.message.includes('is not recognized'),
        getAlternativeArgs: (originalArgs, error, attempt) => {
          const alternatives = this.getCommandAlternatives(originalArgs.command);
          return alternatives.slice(0, attempt).map(cmd => ({ 
            ...originalArgs, 
            command: cmd 
          }));
        },
        maxAttempts: 3
      }
    ]);

    // File operation retry strategies
    this.strategies.set('Read', [
      {
        name: 'file-not-found',
        shouldRetry: (error: Error) => 
          error.message.includes('ENOENT') || 
          error.message.includes('no such file'),
        getAlternativeArgs: (originalArgs, error, attempt) => {
          const variations = this.getFilePathVariations(originalArgs.file_path);
          return variations.slice(0, attempt).map(path => ({ 
            ...originalArgs, 
            file_path: path 
          }));
        },
        maxAttempts: 3
      }
    ]);

    // Glob pattern retry strategies
    this.strategies.set('Glob', [
      {
        name: 'pattern-too-broad',
        shouldRetry: (error: Error) => 
          error.message.includes('too many files') ||
          error.message.includes('pattern too broad'),
        getAlternativeArgs: (originalArgs, error, attempt) => {
          const refinedPatterns = this.refineGlobPattern(originalArgs.pattern, attempt);
          return refinedPatterns.map(pattern => ({ 
            ...originalArgs, 
            pattern 
          }));
        },
        maxAttempts: 3
      }
    ]);

    // Grep search retry strategies
    this.strategies.set('Grep', [
      {
        name: 'no-matches-found',
        shouldRetry: (error: Error, attempt: number) => 
          (error.message.includes('No matches found') || 
           error.message.includes('grep: no matches')) && 
          attempt <= 2,
        getAlternativeArgs: (originalArgs, error, attempt) => {
          const variations = this.getSearchVariations(originalArgs.pattern, attempt);
          return variations.map(pattern => ({ 
            ...originalArgs, 
            pattern 
          }));
        },
        maxAttempts: 3
      }
    ]);
  }

  async executeWithRetry<T>(
    toolName: string,
    originalArgs: any,
    executor: (args: any) => Promise<T>
  ): Promise<RetryResult<T>> {
    const strategies = this.strategies.get(toolName) || [];
    let lastError: Error | undefined;
    const appliedStrategies: string[] = [];

    // First attempt with original args
    try {
      const result = await executor(originalArgs);
      return {
        success: true,
        result,
        attempts: 1,
        strategies: []
      };
    } catch (error) {
      lastError = error as Error;
      console.log(`[${new Date().toISOString()}] TOOL_RETRY: Initial attempt failed for ${toolName}: ${lastError.message}`);
    }

    // Try each applicable strategy
    for (const strategy of strategies) {
      if (!strategy.shouldRetry(lastError!, 1)) continue;

      appliedStrategies.push(strategy.name);
      console.log(`[${new Date().toISOString()}] TOOL_RETRY: Applying strategy "${strategy.name}" for ${toolName}`);

      for (let attempt = 1; attempt <= strategy.maxAttempts; attempt++) {
        const alternativeArgsList = strategy.getAlternativeArgs(originalArgs, lastError!, attempt);
        
        for (const alternativeArgs of alternativeArgsList) {
          try {
            console.log(`[${new Date().toISOString()}] TOOL_RETRY: Attempt ${attempt} with strategy "${strategy.name}"`);
            const result = await executor(alternativeArgs);
            
            console.log(`[${new Date().toISOString()}] TOOL_RETRY: Success with strategy "${strategy.name}" on attempt ${attempt}`);
            return {
              success: true,
              result,
              attempts: attempt + 1,
              strategies: appliedStrategies
            };
          } catch (error) {
            lastError = error as Error;
            console.log(`[${new Date().toISOString()}] TOOL_RETRY: Strategy "${strategy.name}" attempt ${attempt} failed: ${lastError.message}`);
          }
        }
      }
    }

    // All strategies failed
    return {
      success: false,
      error: lastError,
      attempts: strategies.reduce((sum, s) => sum + s.maxAttempts, 1),
      strategies: appliedStrategies
    };
  }

  private getCommandAlternatives(command: string): string[] {
    const alternatives: string[] = [];
    
    // GitHub CLI alternatives
    if (command.includes('gh ')) {
      alternatives.push(command.replace('gh ', 'hub '));
      alternatives.push(`which gh > /dev/null 2>&1 && ${command} || echo "GitHub CLI not installed"`);
    }
    
    // Git alternatives
    if (command.includes('git ')) {
      alternatives.push(`cd "${process.cwd()}" && ${command}`);
    }
    
    // npm/yarn alternatives
    if (command.includes('npm ')) {
      alternatives.push(command.replace('npm ', 'yarn '));
    }
    
    return alternatives;
  }

  private getFilePathVariations(filePath: string): string[] {
    const variations: string[] = [];
    const cwd = process.cwd();
    
    // Try absolute path
    if (!filePath.startsWith('/')) {
      variations.push(`${cwd}/${filePath}`);
    }
    
    // Try relative from different common directories
    const commonDirs = ['src', 'lib', 'dist', 'build'];
    for (const dir of commonDirs) {
      variations.push(`${cwd}/${dir}/${filePath}`);
    }
    
    // Try case variations
    variations.push(filePath.toLowerCase());
    variations.push(filePath.toUpperCase());
    
    return variations;
  }

  private refineGlobPattern(pattern: string, attempt: number): string[] {
    const refined: string[] = [];
    
    switch (attempt) {
      case 1:
        // Add file type restrictions
        if (!pattern.includes('*.*')) {
          refined.push(`${pattern}/**/*.{js,ts,json,md}`);
        }
        break;
      case 2:
        // Limit depth
        refined.push(pattern.replace('**/', '*/'));
        break;
      case 3:
        // Very specific
        refined.push(pattern.replace('**/*', '*'));
        break;
    }
    
    return refined;
  }

  private getSearchVariations(pattern: string, attempt: number): string[] {
    const variations: string[] = [];
    
    switch (attempt) {
      case 1:
        // Case insensitive
        variations.push(`(?i)${pattern}`);
        break;
      case 2:
        // Partial matches
        variations.push(`.*${pattern}.*`);
        break;
      case 3:
        // Word boundaries
        variations.push(`\\b${pattern}\\b`);
        break;
    }
    
    return variations;
  }

  // Add strategy for specific tool/error combinations
  addStrategy(toolName: string, strategy: RetryStrategy): void {
    if (!this.strategies.has(toolName)) {
      this.strategies.set(toolName, []);
    }
    this.strategies.get(toolName)!.push(strategy);
  }

  // Get statistics about retry usage
  getRetryStats(): { [toolName: string]: { [strategyName: string]: number } } {
    // This would be implemented with persistent storage in production
    return {};
  }
}

export const globalRetrySystem = new IntelligentRetrySystem();