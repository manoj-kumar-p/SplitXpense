import {isAutoSmsEnabled} from '../db/queries/settingsQueries';
import {getGroupMembers} from '../db/queries/groupQueries';
import {getLocalUser} from '../db/queries/userQueries';
import {getSyncOrchestrator} from './SyncOrchestrator';

/**
 * Trigger auto-SMS sync to all members of a group (except self).
 * Only runs if auto-SMS sync is enabled in settings.
 */
export async function triggerAutoSmsSync(groupId: string): Promise<void> {
  if (!isAutoSmsEnabled()) return;

  const user = getLocalUser();
  if (!user) return;

  const members = getGroupMembers(groupId);
  const orchestrator = getSyncOrchestrator();

  for (const member of members) {
    if (member.phone_number === user.phone_number) continue;

    // Force SMS sync (even if they're on WiFi, auto-sync covers the case they aren't)
    try {
      await orchestrator.syncWithPeer(member.phone_number, true);
    } catch {
      // Silently fail — SMS outbox will retry later
    }
  }
}
