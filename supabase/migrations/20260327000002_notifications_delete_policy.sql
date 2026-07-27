-- Allow users to clear their own notifications
create policy "Users delete own notifications"
  on public.notifications for delete
  using (recipient_id = auth.uid());
