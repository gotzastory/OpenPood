import Store from 'electron-store';
import { STORE_DIRECTORY } from './storage';
import { sanitizeAppProfiles, type AppProfile } from './activeWindow';

const profileStore = new Store<{ profiles: AppProfile[] }>({
  cwd: STORE_DIRECTORY,
  name: 'app-profiles',
  defaults: { profiles: [] },
});

export function listAppProfiles(): AppProfile[] {
  return sanitizeAppProfiles(profileStore.get('profiles'));
}

export function setAppProfiles(input: unknown): AppProfile[] {
  const profiles = sanitizeAppProfiles(input);
  profileStore.set('profiles', profiles);
  return profiles;
}
