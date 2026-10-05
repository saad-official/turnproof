import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';

import { AppText } from '@/components/app-text';
import { TextField } from '@/components/form-fields';
import { FormSheet } from '@/components/form-sheet';
import { PrimaryButton } from '@/components/primary-button';
import { SegmentedControl } from '@/components/segmented-control';
import { showToast } from '@/components/toast';
import { signInAndSync, signUpAndSync } from '@/data';
import { haptics } from '@/native/haptics';

type Mode = 'signin' | 'signup';

const MODES: readonly { value: Mode; label: string }[] = [
  { value: 'signin', label: 'Sign in' },
  { value: 'signup', label: 'Create account' },
];

/**
 * `account?mode=signin|signup`: email + password through the data layer's account helpers
 * (Better Auth, then sync, memberships, push token and uploads).
 */
export function AccountSheet() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'signup' ? 'signup' : 'signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    if (mode === 'signup' && !name.trim()) return setError('Add your name; hosts and cleaners see it.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Passwords are at least 8 characters.');
    setBusy(true);
    setError(null);
    try {
      const failure =
        mode === 'signin'
          ? await signInAndSync({ email: email.trim(), password })
          : await signUpAndSync({ name: name.trim(), email: email.trim(), password });
      if (failure) {
        haptics.error();
        setError(failure);
        return;
      }
      haptics.finished();
      showToast({ message: mode === 'signin' ? 'Signed in' : 'Account created' });
      router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet
      title={mode === 'signin' ? 'Sign in' : 'Create account'}
      footer={<PrimaryButton title={mode === 'signin' ? 'Sign in' : 'Create account'} size="lg" loading={busy} onPress={submit} />}
    >
      <SegmentedControl
        accessibilityLabel="Sign in or create an account"
        options={MODES}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
      />
      <AppText variant="callout" tone="secondary">
        Your account publishes proof links and shares properties. Turnovers and photos stay on this phone until you publish.
      </AppText>
      {mode === 'signup' ? (
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => emailRef.current?.focus()}
          maxLength={60}
        />
      ) : null}
      <TextField
        ref={emailRef}
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        textContentType={mode === 'signin' ? 'password' : 'newPassword'}
        returnKeyType="go"
        onSubmitEditing={submit}
        error={error}
        hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
      />
    </FormSheet>
  );
}
