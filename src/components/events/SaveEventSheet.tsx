import type { SiftEvent } from "@/types/event";
import SaveToListSheet from "@/components/events/SaveToListSheet";

interface SaveEventSheetProps {
  event: SiftEvent;
  currentListName: string | null;
  onClose: () => void;
  onSaved: (listName: string) => void;
  /** For multi-date events — the date the user chose to save it under. */
  dateOverride?: string;
}

export default function SaveEventSheet({
  event,
  currentListName,
  onClose,
  onSaved,
  dateOverride,
}: SaveEventSheetProps) {
  return (
    <SaveToListSheet
      eventId={event.id}
      eventMeta={{
        title: event.title,
        startDate: dateOverride ?? event.startDate,
        endDate: event.endDate,
        location: event.locationsVary ? "Multiple venues" : event.location,
      }}
      currentListName={currentListName}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
