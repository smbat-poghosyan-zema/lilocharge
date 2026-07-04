import { ScanScreen } from '../src/features/sessions/scan-screen';

/**
 * Mounts the QR scan screen as a standalone route (e.g. for deep links).
 */
export default function ScanRoute(): JSX.Element {
  return <ScanScreen />;
}
