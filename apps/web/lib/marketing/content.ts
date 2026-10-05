/** Copy shared by the marketing pages. Plain, specific, nothing we cannot back up. */

export const SUPPORT_EMAIL = "saad.khan+turnproof@zortik.com";

export const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/#features", label: "On your phone" },
  { href: "/#proof", label: "The proof link" },
  { href: "/#free", label: "Why free" },
  { href: "/example", label: "Example" },
  { href: "/support", label: "Support" },
] as const;

export const STEPS = [
  {
    title: "Start the turnover",
    body: "Pick the property from today's list and tap Start. The timer begins and a Live Activity appears on the Lock Screen.",
  },
  {
    title: "Before photos, room by room",
    body: "Each room opens on the camera. Shoot the room as you found it; every shot is stamped with the time, the phone and, if you allow it, a rough location.",
  },
  {
    title: "Work the checklist",
    body: "Tick the room's items as you go: the ones you set up once per property, with restock reminders. Spot damage? Log an issue with a photo and a note.",
  },
  {
    title: "After photos",
    body: "Same angles, clean room. A room counts as done when its required items are ticked and it has at least one after photo.",
  },
  {
    title: "Finish",
    body: "Turnproof adds it up: how long it took, rooms and items done, photos, issues. Everything is saved on the phone, signal or not.",
  },
  {
    title: "Share the link",
    body: "Signed in, one tap uploads the photos and makes a private link for the host. They open it in any browser, no account, no app.",
  },
] as const;

export const FAQ = [
  {
    q: "Is it really free?",
    a: "Yes. There is nothing to buy in the app, no subscription and no ads. It runs on free hosting tiers, and it can because photos stay on your phone and only travel when you share a proof link.",
  },
  {
    q: "Does the host need the app or an account?",
    a: "No. The proof link opens in any browser. If a host wants your turnovers to appear on their own phone, they can join the property with its invite code, but that is optional.",
  },
  {
    q: "Can I use photos from my camera roll?",
    a: "You can add them, but only as reference photos. They are labelled “Reference photo” everywhere and never get the “Verified capture” badge, because nobody can know when or where they were taken.",
  },
  {
    q: "Will a proof link win my damage claim?",
    a: "We can't promise that, and nobody honest can. What the link gives you is time-stamped, camera-captured photos with a fingerprint check, organised room by room and shareable within minutes of checkout, which is the kind of evidence claim processes ask for.",
  },
  {
    q: "Does it work without a signal?",
    a: "Yes. Checklists, photos, stamps and the timer all work offline. Sync and proof links wait until you are back online.",
  },
  {
    q: "What happens to the photos I upload?",
    a: "They are uploaded only when you publish a proof link and stored until about a week after the link expires (60 days) or you withdraw it. Deleting the turnover or your account removes them too.",
  },
  {
    q: "When can I get it?",
    a: "Turnproof is in testing for iPhone and Android. Write to support if you would like to try it early.",
  },
] as const;
