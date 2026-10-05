// Connectivity (expo-network) for the upload queue and sync: one read and a change listener.
import * as Network from 'expo-network';

/** True unless the OS says there is no connection or the internet is unreachable. */
export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (state.isConnected === false) return false;
    return state.isInternetReachable !== false;
  } catch {
    return true; // unknown: let the request decide
  }
}

/** Calls `listener(online)` when connectivity changes. Returns unsubscribe. */
export function addConnectivityListener(listener: (online: boolean) => void): () => void {
  try {
    const sub = Network.addNetworkStateListener((state) => {
      listener(state.isConnected !== false && state.isInternetReachable !== false);
    });
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}
