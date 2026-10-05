import type { IconName } from '@/constants/icons';

export type HeaderAction = {
  key: string;
  icon: IconName;
  /** Spoken label (icon-only buttons). */
  label: string;
  onPress: () => void;
  prominent?: boolean;
};

export type HeaderActionsProps = { actions: HeaderAction[] };
