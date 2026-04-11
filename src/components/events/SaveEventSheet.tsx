import type { SiftEvent } from "@/types/event";
import SaveToListSheet from "@/components/events/SaveToListSheet";

interface SaveEventSheetProps {
  event: SiftEvent;
  currentListName: string | null;
  onClose: () => void;
  onSaved: (listName: string) => void;
}

export default function SaveEventSheet({
  event,
  currentListName,
  onClose,
  onSaved,
}: SaveEventSheetProps) {
  return (
    <SaveToListSheet
      eventId={event.id}
      eventMeta={{
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        location: event.locationsVary ? "Multiple venues" : event.location,
      }}
      currentListName={currentListName}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
