import type { UseTranslationResponse } from 'react-i18next';
import { useTranslation } from 'react-i18next';

import './i18n';

/**
 * Returns translation helpers using the application's default namespace.
 */
export function useAppTranslation(): UseTranslationResponse<'common', undefined> {
  return useTranslation('common');
}
