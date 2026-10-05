import { InviteCodeSchema } from '@turnproof/shared';
import { router } from 'expo-router';
import { useState } from 'react';

import { AppText } from '@/components/app-text';
import { TextField } from '@/components/form-fields';
import { FormSheet } from '@/components/form-sheet';
import { ListGroup, ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { showToast } from '@/components/toast';
import { icons } from '@/constants/icons';
import { ApiError, joinProperty } from '@/data';
import { useSession } from '@/hooks/use-session';
import { haptics } from '@/native/haptics';

function joinError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return "You're offline. Try again when you're connected.";
    if (e.code === 'invite_not_found' || e.status === 404) return 'No property uses that code. Check it with your host.';
    if (e.code === 'already_member' || e.status === 409) return 'You already have this property.';
    return e.message || 'Could not join.';
  }
  return e instanceof Error ? e.message : 'Could not join.';
}

/** `join`: a cleaner enters the host's invite code; the property and its schedule sync down. */
export function JoinSheet() {
  const { data: session, isPending } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const join = async () => {
    const value = code.trim().toUpperCase();
    if (!InviteCodeSchema.safeParse(value).success) {
      haptics.warning();
      setError('Codes are 6 to 8 letters and numbers.');
      return;
    }
    setBusy(true);
    try {
      const r = await joinProperty(value);
      haptics.finished();
      showToast({ message: r.property ? `Joined ${r.property.name}` : 'Joined. The property appears after the next sync.' });
      router.back();
    } catch (e) {
      haptics.error();
      setError(joinError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet title="Join with a code" footer={session ? <PrimaryButton title="Join property" icon={icons.personAdd} size="lg" loading={busy} onPress={join} /> : undefined}>
      <AppText variant="body" tone="secondary">
        Your host finds the code on the property in Turnproof under “Share with your cleaner”.
      </AppText>
      {!session && !isPending ? (
        <ListGroup footer="Joining needs an account so you and your host see the same schedule.">
          <ListRow icon={icons.account} title="Sign in or create an account" onPress={() => router.push('/account')} />
        </ListGroup>
      ) : (
        <TextField
          label="Invite code"
          value={code}
          onChangeText={(v) => {
            setCode(v.toUpperCase());
            if (error) setError(null);
          }}
          placeholder="ABC234"
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          maxLength={8}
          returnKeyType="go"
          onSubmitEditing={join}
          error={error}
          style={{ letterSpacing: 4 }}
        />
      )}
    </FormSheet>
  );
}
