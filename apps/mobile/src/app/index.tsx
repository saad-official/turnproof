import { Redirect } from 'expo-router';

/** `/` opens Today (widgets and generic pushes link to `turnproof://today`). */
export default function Index() {
  return <Redirect href="/today" />;
}
