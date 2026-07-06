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

/** Charge-point authentication modes supported by the OCPP WebSocket server. */
export const OCPP_AUTH_MODES = ['open', 'allowlist', 'basic'] as const;

/** Default charge-point authentication mode (backwards compatible with dev/e2e setups). */
export const DEFAULT_OCPP_AUTH_MODE = 'open';

/** OCPP 1.6-J Authorize action name (not yet present in the shared OcppAction enum). */
export const OCPP_AUTHORIZE_ACTION = 'Authorize';
