/** Default TCP port for the OCPP WebSocket server. */
export const DEFAULT_OCPP_PORT = 9220;

/** Default host binding for the OCPP WebSocket server. */
export const DEFAULT_OCPP_HOST = '0.0.0.0';

/** Supported OCPP subprotocols for the central system. */
export const OCPP_PROTOCOLS = ['ocpp1.6'] as const;

/** Default heartbeat interval returned during BootNotification acceptance. */
export const DEFAULT_BOOT_NOTIFICATION_INTERVAL_SECONDS = 300;

/** Environment variable values that disable the OCPP server at runtime. */
export const DISABLED_FLAG_VALUES = ['0', 'false', 'no', 'off'] as const;
