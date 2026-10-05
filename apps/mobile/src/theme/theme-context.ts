import { createContext, use } from 'react';

import { buildAppTheme, type AppTheme } from './palette';

export const ThemeContext = createContext<AppTheme>(buildAppTheme('light'));

/** The resolved theme for the current colour scheme. Referentially stable per scheme. */
export function useTheme(): AppTheme {
  return use(ThemeContext);
}
