import { router } from 'expo-router';
import { useState } from 'react';

import { AppText } from '@/components/app-text';
import { TextField } from '@/components/form-fields';
import { FormSheet } from '@/components/form-sheet';
import { PrimaryButton } from '@/components/primary-button';
import { showToast } from '@/components/toast';
import { deleteAccountEverywhere } from '@/data';
import { haptics } from '@/native/haptics';

/** `delete-account`: confirms with the password, deletes the account and its server data. */
export function DeleteAccountSheet() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!password) {
      setError('Enter your password to confirm.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const failure = await deleteAccountEverywhere(password);
      if (failure) {
        haptics.error();
        setError(failure);
        return;
      }
      haptics.warning();
      showToast({ message: 'Account deleted' });
      router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet title="Delete account" footer={<PrimaryButton title="Delete my account" variant="destructive" size="lg" loading={busy} onPress={remove} />}>
      <AppText variant="body">
        This permanently deletes your Turnproof account and the data stored with it on the server.
      </AppText>
      <AppText variant="callout" tone="secondary">
        Data on this phone stays until you delete it in Settings → Data.
      </AppText>
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={remove}
        error={error}
      />
    </FormSheet>
  );
}
