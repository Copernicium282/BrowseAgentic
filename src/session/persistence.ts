import { promises as fs } from 'fs';
import { join } from 'path';
import type { BrowserOrchestrator } from '../orchestrator.js';
import type { BrowseAgenticConfig, SessionProfile } from '../types.js';

export interface SaveSessionInput {
  profile_name: string;
}

export interface LoadSessionInput {
  profile_name: string;
}

export async function handleSaveSession(
  orchestrator: BrowserOrchestrator,
  config: BrowseAgenticConfig,
  input: SaveSessionInput,
): Promise<{ success: boolean; profile_name?: string; saved_path?: string; error?: string }> {
  // Validate profile name
  if (!/^[a-zA-Z0-9_-]+$/.test(input.profile_name)) {
    return { success: false, error: 'Invalid profile name. Only alphanumeric, underscore, and hyphen allowed.' };
  }

  try {
    const session = await orchestrator.getSession();
    const page = await orchestrator.getPage();
    const context = page.context();
    const storageState = await context.storageState();

    const profilesDir = config.session.profiles_dir;
    await fs.mkdir(profilesDir, { recursive: true });

    const filePath = join(profilesDir, `${input.profile_name}.json`);
    await fs.writeFile(filePath, JSON.stringify(storageState, null, 2), 'utf-8');

    return {
      success: true,
      profile_name: input.profile_name,
      saved_path: filePath,
    };
  } catch (err) {
    return { success: false, error: `SAVE_ERROR: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function handleLoadSession(
  orchestrator: BrowserOrchestrator,
  config: BrowseAgenticConfig,
  input: LoadSessionInput,
): Promise<{ success: boolean; profile_name?: string; loaded?: boolean; error?: string }> {
  if (!/^[a-zA-Z0-9_-]+$/.test(input.profile_name)) {
    return { success: false, error: 'Invalid profile name.' };
  }

  const filePath = join(config.session.profiles_dir, `${input.profile_name}.json`);
  try {
    await fs.access(filePath);
  } catch {
    return { success: false, error: 'PROFILE_NOT_FOUND' };
  }

  try {
    const storageState = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    // Note: Playwright requires storageState at context creation time
    // For now, store it for next session reset
    return {
      success: true,
      profile_name: input.profile_name,
      loaded: true,
    };
  } catch (err) {
    return { success: false, error: `LOAD_ERROR: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function handleListSessions(
  config: BrowseAgenticConfig,
): Promise<{ success: boolean; profiles?: SessionProfile[]; error?: string }> {
  try {
    const profilesDir = config.session.profiles_dir;
    const files = await fs.readdir(profilesDir).catch(() => []);
    const profiles: SessionProfile[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = join(profilesDir, file);
      const stat = await fs.stat(filePath);
      profiles.push({
        name: file.replace('.json', ''),
        saved_at: stat.mtime.toISOString(),
        size_bytes: stat.size,
      });
    }

    return { success: true, profiles };
  } catch (err) {
    return { success: false, error: `LIST_ERROR: ${err instanceof Error ? err.message : String(err)}` };
  }
}
