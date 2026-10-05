import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState, type ReactNode, type Ref } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { formatHhmm, hhmmToDate, toHhmm } from '@/constants/format';
import { icons } from '@/constants/icons';
import { haptics } from '@/native/haptics';
import { CHROME_FONT_CAP, radius, spacing, textStyles, touchTarget, useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/** Label + control + optional hint / error, the building block of every form. */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="callout" weight="600" tone="secondary">
        {label}
      </AppText>
      {children}
      {error ? (
        <AppText variant="caption" tone="issue" accessibilityLiveRegion="polite" selectable>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" tone="secondary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export type TextFieldProps = TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
  ref?: Ref<TextInput>;
};

/** A labelled text input on a sunken well. Grows with Dynamic Type. */
export function TextField({ label, hint, error, style, multiline, ref, ...props }: TextFieldProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      <PlainInput ref={ref} accessibilityLabel={label} multiline={multiline} invalid={!!error} style={style} {...props} />
    </Field>
  );
}

/** The input well without a label (inline editors). */
export function PlainInput({ style, multiline, invalid, ref, ...props }: TextInputProps & { invalid?: boolean; ref?: Ref<TextInput> }) {
  const { colors } = useTheme();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.textTertiary}
      selectionColor={colors.accent}
      multiline={multiline}
      style={[
        textStyles.body,
        {
          color: colors.text,
          backgroundColor: colors.surfaceSunken,
          borderRadius: radius.sm,
          borderCurve: 'continuous',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          minHeight: multiline ? 96 : touchTarget + spacing.xs,
          textAlignVertical: multiline ? 'top' : 'center',
          borderWidth: invalid ? 1.5 : 0,
          borderColor: colors.issue,
        },
        style,
      ]}
      {...props}
    />
  );
}

/** Single- or multi-select chips that wrap (property, day, room kinds). */
export function ChoiceChips<T extends string | number>({
  options,
  isSelected,
  onToggle,
  accessibilityLabel,
  multi,
}: {
  options: readonly { value: T; label: string }[];
  isSelected: (value: T) => boolean;
  onToggle: (value: T) => void;
  accessibilityLabel: string;
  multi?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={multi ? undefined : 'radiogroup'}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}
    >
      {options.map((o) => {
        const selected = isSelected(o.value);
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            accessibilityState={multi ? { checked: selected } : { selected }}
            accessibilityLabel={o.label}
            onPress={() => {
              haptics.selection();
              onToggle(o.value);
            }}
            style={({ pressed }) => ({
              minHeight: touchTarget,
              minWidth: touchTarget,
              paddingHorizontal: spacing.md,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? colors.accent : pressed ? colors.border : colors.surfaceSunken,
            })}
          >
            <AppText
              variant="callout"
              weight="600"
              maxFontSizeMultiplier={CHROME_FONT_CAP}
              style={{ color: selected ? colors.onAccent : colors.text }}
            >
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A wall-clock time (`HH:mm`). iOS: the native compact picker inline. Android: a chip that opens the
 * Material time dialog (the picker is mounted only while open, per the dialog contract).
 */
export function TimeField({ value, onChange, label }: { value: string; onChange: (hhmm: string) => void; label: string }) {
  const { colors, scheme } = useTheme();
  const [open, setOpen] = useState(false);

  if (process.env.EXPO_OS === 'ios') {
    return (
      <View accessibilityLabel={`${label}, ${formatHhmm(value)}`} style={{ alignItems: 'flex-start' }}>
        <DateTimePicker
          value={hhmmToDate(value)}
          mode="time"
          display="compact"
          accentColor={colors.accent}
          themeVariant={scheme}
          onValueChange={(_, date) => onChange(toHhmm(date))}
        />
      </View>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${formatHhmm(value)}`}
        accessibilityHint="Opens the time picker"
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          minHeight: touchTarget,
          alignSelf: 'flex-start',
          paddingHorizontal: spacing.md,
          borderRadius: radius.sm,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          backgroundColor: pressed ? colors.border : colors.surfaceSunken,
        })}
      >
        <Icon name={icons.clock} size={18} color={colors.accentText} />
        <AppText variant="body" weight="600" tabular>
          {formatHhmm(value)}
        </AppText>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={hhmmToDate(value)}
          mode="time"
          presentation="dialog"
          accentColor={colors.accent}
          onValueChange={(_, date) => {
            setOpen(false);
            onChange(toHhmm(date));
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
