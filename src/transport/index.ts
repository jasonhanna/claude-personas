/**
 * Transport module exports and registration
 */

export { Transport, TransportMessage, TransportConfig, TransportFactory } from './transport-interface.js';
export { HttpTransport, HttpTransportConfig } from './http-transport.js';

// Auto-register built-in transports
import { TransportFactory } from './transport-interface.js';
import { HttpTransport } from './http-transport.js';

TransportFactory.register('http', HttpTransport);

// Future transports will be registered here:
// TransportFactory.register('websocket', WebSocketTransport);
// TransportFactory.register('ipc', IpcTransport);