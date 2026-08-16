// Fallback Supabase configuration.
// The app reads credentials from the Settings UI (stored in localStorage) first.
// This file is only used if localStorage has no credentials.
window.SUPABASE_CONFIG = {
  enabled: false,
  url: '',
  anonKey: '',
  profileId: ''
};
