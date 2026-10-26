// Device-side policy also checks installed app labels. Keep known package blocks
// here so a rejected launch is never queued in the first place.
export const blockedPackages = new Set([
  'com.androidphonecontrol',
  'com.samsung.android.app.notes', 'com.samsung.android.snote',
  'com.miui.notes', 'com.coloros.note', 'com.oplus.note', 'com.oneplus.note',
  'com.google.android.apps.authenticator2', 'com.azure.authenticator'
]);
export const packagePattern = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
export function canLaunchPackage(value) {
  return typeof value === 'string' && value.length <= 255 && packagePattern.test(value) && !blockedPackages.has(value);
}
