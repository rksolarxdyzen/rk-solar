import { getMyReminders } from "@/actions/reminders";
import { RemindersWidget } from "@/components/reminders/reminders-widget";
import { PageHeader } from "@/components/layout/page-header";

/** Full reminders list — opened from Alerts drawer “View all reminders”. */
export default async function AlertsPage() {
  const summary = await getMyReminders();

  return (
    <div>
      <PageHeader
        eyebrow="Alerts"
        title="All reminders"
        subtitle="Follow-ups and scheduled site visits for your queue. Use the bell for a quick drawer."
      />
      <RemindersWidget summary={summary} />
    </div>
  );
}
