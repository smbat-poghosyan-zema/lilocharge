/** Default TCP port for the OCPP WebSocket server. */
export const DEFAULT_OCPP_PORT = 9220;

/** Default host binding for the OCPP WebSocket server. */
export const DEFAULT_OCPP_HOST = '0.0.0.0';

/** OCPP 1.6-J WebSocket subprotocol identifier. */
export const OCPP_PROTOCOL_1_6 = 'ocpp1.6';

/** OCPP 2.0.1 WebSocket subprotocol identifier. */
export const OCPP_PROTOCOL_2_0_1 = 'ocpp2.0.1';

/**
 * Supported OCPP subprotocols for the central system, in server preference order.
 *
 * `ocpp-rpc` negotiates per client: the first entry here that the charge point also offered
 * wins, so 1.6-only and 2.0.1-only charge points can connect to the same listener.
 */
export const OCPP_PROTOCOLS = [OCPP_PROTOCOL_1_6, OCPP_PROTOCOL_2_0_1] as const;

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
