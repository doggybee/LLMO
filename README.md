# Lightweight LLM-MCP Orchestrator (LLMO)

A configurable service that orchestrates interactions between LLM APIs and Micro-Capability Protocol (MCP) servers, with dynamic tool discovery and robust process management.

## Overview

LLMO v1.4 is a backend service that:

1. Manages local MCP server processes (starting, stopping, monitoring)
2. Dynamically discovers tools from MCP servers via stdio JSON-RPC
3. Routes requests to different LLM providers
4. Orchestrates tool calls between LLMs and MCPs
5. Supports streaming responses for fluid conversational experiences

## Key Features

- **Dynamic Tool Discovery**: Automatically discovers available tools from each MCP on startup
- **Configuration-Driven**: Simple configuration of LLM providers and MCP servers
- **Robust Process Management**: Reliable MCP process lifecycle with graceful shutdown
- **Resilient Communication**: Robust stdio JSON-RPC communication with comprehensive error handling
- **Tool Call Orchestration**: Sequential tool call execution with detailed error reporting
- **Streaming Support**: Server-Sent Events (SSE) for responsive UX
- **Structured Logging**: Detailed context-rich logging for debugging and monitoring

## Requirements

- Node.js 18+ (LTS)
- npm or yarn

## Installation

1. Clone the repository:
   ```bash
   git clone [repository-url]
   cd llmo
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the example environment file and update it with your API keys:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. Review and update the `config.yaml` file to configure your LLM providers and MCP servers.

## Configuration

LLMO v1.4 uses a simplified configuration format in YAML or JSON:

### LLM Providers
Configure one or more LLM providers with their API endpoints, authentication, and supported models.

### MCP Servers
Configure MCP servers with just their launch parameters - LLMO will dynamically discover their tools on startup.

### Example Configuration
```yaml
# LLM Providers
llmProviders:
  - name: openai
    apiEndpoint: https://api.openai.com/v1/chat/completions
    authType: bearer
    authEnvVar: OPENAI_API_KEY
    models:
      - gpt-4
      - gpt-3.5-turbo

# MCP Servers (Local Processes)
mcpServers:
  - name: filesystem
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-filesystem"
      - "/path/to/directory"
  
  - name: calculator
    command: node
    args: 
      - ./mcp-servers/calculator.js
    env:
      DEBUG: "true"

# Timeouts (in milliseconds)
timeouts:
  mcpResponse: 30000       # 30 seconds
  gracefulShutdown: 5000   # 5 seconds
```

## Running the Service

1. Build the project:
   ```bash
   npm run build
   ```

2. Start the server:
   ```bash
   npm start
   ```

For development with auto-reload:
   ```bash
   npm run dev
   ```

## How It Works

1. **Startup Process**:
   - LLMO loads the configuration and validates it
   - Launches all configured MCP processes
   - Sends `tools/list` requests to each MCP to discover available tools
   - Caches tool definitions in memory
   - Starts the HTTP server

2. **Tool Discovery**:
   - On startup, LLMO sends a `tools/list` JSON-RPC request to each MCP
   - MCPs respond with their available tools (name, description, parameterSchema)
   - LLMO caches these definitions and maps tool names to their providing MCP

3. **Chat Request Flow**:
   - Client sends a request to `/chat` endpoint
   - LLMO routes to the appropriate LLM based on the requested model
   - LLMO includes all cached tool definitions in the LLM request
   - When LLM returns tool_calls, LLMO:
     - Maps the tool name to its MCP
     - Sends a `tools/call` request to the appropriate MCP
     - Returns the MCP's response (or error) back to the LLM
   - Streamed responses are forwarded to the client in real-time

## API Endpoints

### Health Check

```
GET /health
```

Returns server status information.

### Chat

```
POST /chat
```

Body:
```json
{
  "model": "gpt-4",
  "messages": [
    {"role": "user", "content": "What's in my Documents folder?"}
  ],
  "stream": true
}
```

## Error Handling

LLMO implements standardized error handling:

- For non-streaming responses: JSON error objects with code and message
- For streaming responses: SSE error events
- For tool calls: Specific MCP_* error types with detailed messages:
  - `MCP_UNAVAILABLE`: The MCP process is not available
  - `MCP_COMMUNICATION_ERROR`: Error in stdio communication
  - `MCP_TIMEOUT`: The MCP response timed out
  - `MCP_INVALID_RESPONSE`: Invalid JSON-RPC response from MCP

## Project Structure

The project is organized as follows:

- `src/config`: Configuration schema and loading
- `src/process-manager`: MCP process lifecycle management
- `src/mcp-client`: Stdio JSON-RPC communication
- `src/llm-client`: LLM API interaction
- `src/routes`: API endpoints
- `src/types`: TypeScript interfaces and types
- `src/utils`: Shared utilities

## License

MIT