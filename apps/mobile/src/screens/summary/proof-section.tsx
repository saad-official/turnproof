import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { Alert, Share, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { ProgressTrack } from '@/components/glass-bar';
import { ListGroup, ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { SectionHeader } from '@/components/section-header';
import { proofPillKind, StatePill } from '@/components/state-pill';
import { dateLabel } from '@/constants/format';
import { icons } from '@/constants/icons';
import { publishFailureMessage } from '@/constants/messages';
import { publishProof, revokeProof } from '@/data';
import { proofExpiryDays } from '@/hooks/use-app-preferences';
import { useProofs } from '@/hooks/use-proofs';
import { useSession } from '@/hooks/use-session';
import { haptics } from '@/native/haptics';
import { radius, spacing, useTheme } from '@/theme';

async function shareLink(url: string, propertyName: string) {
  await Share.share({ message: `Turnover proof for ${propertyName}: ${url}`, url, title: 'Turnover proof' }).catch(() => undefined);
}

/**
 * The public proof link: publish (photo uploads with progress → link → share sheet), then share,
 * open or revoke it. Signed-out users are sent to the account sheet first.
 */
export function ProofSection({ turnoverId, propertyName }: { turnoverId: string; propertyName: string }) {
  const { colors, shadow } = useTheme();
  const { data: session, isPending } = useSession();
  const { proofs, current } = useProofs(turnoverId);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const past = proofs.filter((p) => p.id !== current?.id);

  const publish = async () => {
    setPublishing(true);
    setError(null);
    setProgress(null);
    abort.current = new AbortController();
    try {
      const r = await publishProof(turnoverId, {
        expiresInDays: proofExpiryDays(),
        signal: abort.current.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (!r.ok) {
        haptics.error();
        if (r.reason === 'signed-out') router.push('/account');
        else setError(publishFailureMessage(r));
        return;
      }
      haptics.finished();
      await shareLink(r.url, propertyName);
    } finally {
      setPublishing(false);
      setProgress(null);
      abort.current = null;
    }
  };

  const confirmRevoke = () => {
    if (!current) return;
    haptics.warning();
    Alert.alert('Revoke this link?', 'Anyone who opens it will see that it is no longer available. You can publish a new link later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          setRevoking(true);
          try {
            await revokeProof(current.id);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not revoke the link.');
          } finally {
            setRevoking(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title="Proof link" detail="A private page the host opens in a browser" />
      {current ? (
        <View
          style={{
            backgroundColor: colors.surfaceElevated,
            borderRadius: radius.lg,
            borderCurve: 'continuous',
            padding: spacing.md,
            gap: spacing.sm,
            boxShadow: shadow('sm'),
          }}
        >
          <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
            <StatePill kind="proof-active" />
            <StatePill kind="scheduled" label={`Expires ${dateLabel(current.expiresAt)}`} />
          </View>
          <AppText variant="body" tone="accent" weight="600" selectable accessibilityHint="Long-press to copy">
            {current.url}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <PrimaryButton title="Share link" icon={icons.share} onPress={() => shareLink(current.url, propertyName)} style={{ flex: 1 }} />
            <PrimaryButton
              title="Open"
              icon={icons.open}
              variant="secondary"
              block={false}
              onPress={() => WebBrowser.openBrowserAsync(current.url).catch(() => undefined)}
            />
          </View>
          <PrimaryButton title="Revoke link" icon={icons.close} variant="ghost" loading={revoking} onPress={confirmRevoke} />
        </View>
      ) : !session && !isPending ? (
        <ListGroup footer="Photos stay on this phone until you publish. You don't need an account for anything else.">
          <ListRow icon={icons.account} title="Sign in to publish a proof link" onPress={() => router.push('/account')} />
        </ListGroup>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {publishing ? (
            <View style={{ gap: spacing.xs }} accessibilityLiveRegion="polite">
              <ProgressTrack
                progress={progress && progress.total > 0 ? progress.done / progress.total : 0.05}
                height={8}
                accessibilityLabel="Publishing proof link"
              />
              <AppText variant="callout" tone="secondary" tabular>
                {progress && progress.total > 0 ? `Uploading photos ${progress.done} of ${progress.total}…` : 'Preparing the proof page…'}
              </AppText>
            </View>
          ) : null}
          <PrimaryButton
            title={publishing ? 'Publishing…' : 'Publish proof link'}
            icon={icons.link}
            size="lg"
            loading={publishing}
            onPress={publish}
            accessibilityHint="Uploads the photos and creates a link you can send to the host"
          />
          {publishing ? <PrimaryButton title="Cancel" variant="ghost" onPress={() => abort.current?.abort()} /> : null}
          {error ? (
            <AppText variant="callout" tone="issue" selectable accessibilityLiveRegion="polite">
              {error}
            </AppText>
          ) : (
            <AppText variant="caption" tone="secondary">
              {`The link expires after ${proofExpiryDays()} days (change the default in Settings) and you can revoke it any time.`}
            </AppText>
          )}
        </View>
      )}
      {past.length > 0 ? (
        <ListGroup>
          {past.map((p) => (
            <ListRow
              key={p.id}
              title={`Published ${dateLabel(p.publishedAt)}`}
              subtitle={p.url}
              trailing={<StatePill kind={proofPillKind(p.state)} />}
            />
          ))}
        </ListGroup>
      ) : null}
    </View>
  );
}
