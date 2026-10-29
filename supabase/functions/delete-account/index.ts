// Self-service account deletion (App Store Guideline 5.1.1(v) -- an app
// that lets you create an account must let you delete it in-app, not
// just email a request). Needs the service-role key to actually remove
// the auth.users row, so this runs server-side, same reasoning as
// ai-proxy keeping GEMINI_API_KEY off the client.
//
// profiles.id cascades from auth.users (0001_init.sql), and every other
// table that references profiles(id) is now either ON DELETE CASCADE
// (the user's own data: transactions, categories, bills, income_sources,
// etc.) or ON DELETE SET NULL (flats.created_by, shared_expenses.paid_by,
// shared_expense_splits.user_id, settlements.from_user/to_user -- see
// 0036_nullable_profile_refs_for_account_deletion.sql). So deleting the
// auth user alone is enough: your own data is gone, and anything you did
// inside a shared flat survives for the other members with its "who"
// pointer set to null (the UI shows "Deleted User" there).
//
// One thing the cascade alone doesn't handle: if the departing user is the
// SOLE admin of a flat, a plain cascade-delete of their flat_members row
// leaves that flat permanently admin-less (rename/delete-flat and every
// chore action are gated on is_flat_admin(), with no recovery path in the
// UI). leave_flat (0045) already solves this for the explicit "leave a
// flat" action, but only runs as the leaving user themselves (auth.uid()).
// This runs as service_role on the user's behalf instead, so it calls the
// parameterized equivalent (0054) before the cascade deletion removes
// their membership.
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export default {
  fetch: async (req: Request) => {
    try {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return Response.json({ error: "Missing Authorization header." }, { status: 401 });
      }

      // Identify the caller from their OWN JWT -- never trust a client-
      // supplied user id, or anyone could ask this function to delete
      // someone else's account. The anon key + forwarded Authorization
      // header is the standard pattern for "who is actually calling this."
      const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await callerClient.auth.getUser();
      if (userError || !user) {
        return Response.json({ error: "Not authenticated." }, { status: 401 });
      }

      // Service-role client, only for this one privileged call -- the
      // key never reaches the client, same posture as ai-proxy's
      // GEMINI_API_KEY.
      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const { error: promoteError } = await adminClient.rpc("promote_admins_before_account_deletion", {
        p_user_id: user.id,
      });
      if (promoteError) {
        return Response.json({ error: promoteError.message }, { status: 500 });
      }

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
      if (deleteError) {
        return Response.json({ error: deleteError.message }, { status: 500 });
      }

      return Response.json({ success: true });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Unknown error." },
        { status: 500 },
      );
    }
  },
};
