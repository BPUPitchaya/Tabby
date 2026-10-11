import { supabase } from '@/lib/supabase';

// Purpose-built for one decision: whether solo (no-flat) users actually
// open the Flat tab more than once, or just ignore it. See flat_tab_views
// migration (0011). Not a general analytics pipeline -- if a second
// question comes up later, that's the time to generalize this, not now.
//
// Fire-and-forget: a logging failure should never be visible to the user
// or block navigation, so errors are swallowed rather than surfaced.
export function logFlatTabView(userId: string, hasFlat: boolean) {
  supabase
    .from('flat_tab_views')
    .insert({ user_id: userId, has_flat: hasFlat })
    .then(({ error }) => {
      if (error) console.warn('logFlatTabView failed:', error.message);
    });
}
