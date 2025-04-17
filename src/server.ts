import fastify, { FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import path from 'path';
import { logger } from './utils/logger';
import { loadConfig } from './config/loader';
import { MCPManager } from './process-manager/mcp-manager';
import { StdioClient } from './mcp-client/stdio-client';
import { LLMClient } from './llm-client/llm-client';
import { registerHealthRoute } from './routes/health';
import { registerChatRoute } from './routes/chat';

// Load environment variables
dotenv.config();

// Default config path
const DEFAULT_CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, '../config.yaml');

// Server port
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 12350;

/**
 * Attempt to gracefully shut down MCP processes
 */
async function shutdownMCPs(mcpManager: MCPManager): Promise<void> {
  try {
    logger.info('Attempting to shut down MCP processes after server start failure');
    await mcpManager.shutdownAllMCPs();
    logger.info('All MCP processes shut down successfully');
  } catch (shutdownError: unknown) {
    logger.error({ error: shutdownError }, 'Failed to shut down MCP processes cleanly');
  }
}

/**
 * Start the LLMO server
 */
async function startServer() {
  // Reference to MCP manager for potential graceful shutdown
  let mcpManager: MCPManager | null = null;
  
  try {
    logger.info('Starting LLMO server...');
    
    // Load configuration
    const config = await loadConfig(DEFAULT_CONFIG_PATH);
    
    // Create MCP manager and stdio client
    mcpManager = new MCPManager(config.timeouts.gracefulShutdown);
    const stdioClient = new StdioClient(config.timeouts.mcpResponse);
    
    // Use the real LLM client
    const llmClient = new LLMClient();
    
    // Initialize MCP processes
    await mcpManager.initializeMCPs(config.mcpServers);
    
    // Create Fastify server
    const serverOptions: FastifyServerOptions = {
      logger: true,
      trustProxy: true
    };
    
    const server = fastify(serverOptions);
    
    // Register CORS
    await server.register(cors);
    
    // Register routes
    await registerHealthRoute(server);
    await registerChatRoute(server, config, mcpManager, stdioClient, llmClient);
    
    // Start server
    try {
      await server.listen({ port: PORT, host: '0.0.0.0' });
      logger.info(`LLMO server is listening on port ${PORT}`);
    } catch (serverError: unknown) {
      // Handle server-specific errors, especially port conflicts
      if (typeof serverError === 'object' && serverError !== null && 'code' in serverError && serverError.code === 'EADDRINUSE') {
        throw {
          message: `Port ${PORT} is already in use by another process.`,
          code: 'EADDRINUSE',
          originalError: serverError
        };
      }
      throw serverError;
    }
    
    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason }, 'Unhandled Rejection');
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error({ error }, 'Uncaught Exception');
      process.exit(1);
    });
  } catch (error: unknown) {
    // Handle errors based on type
    const isPortConflict = typeof error === 'object' && error !== null && 'code' in error && error.code === 'EADDRINUSE';
    
    if (isPortConflict) {
      logger.error(
        { error, port: PORT },
        `Port ${PORT} is already in use by another process. To resolve this issue:

1. Find the process using the port:
   - On macOS/Linux: Run 'lsof -i :${PORT}'
   - On Windows: Run 'netstat -ano | findstr ${PORT}'

2. Either:
   - Stop the conflicting process, or
   - Start LLMO on a different port using: PORT=<different_port> npm start

Note: Port conflicts are common when multiple services are running simultaneously.`
      );
      
      // Try to shut down MCP processes gracefully before exiting
      if (mcpManager) {
        await shutdownMCPs(mcpManager);
      }
      
      // Exit with a specific error code for port conflict
      process.exit(2);
    } else {
      logger.error({ error }, 'Failed to start server');
      
      // Try to shut down MCP processes gracefully before exiting
      if (mcpManager) {
        await shutdownMCPs(mcpManager);
      }
      
      process.exit(1);
    }
  }
}

// Start the server
startServer();