import { useState } from "react";
import type { SiftEvent } from "@/types/event";
import GoingDateSheet from "@/components/events/GoingDateSheet";
import SaveToListSheet from "@/components/events/SaveToListSheet";

interface SaveEventSheetProps {
  event: SiftEvent;
  currentListName: string | null;
  onClose: () => void;
  onSaved: (listName: string) => void;
}

const isMultiDate = (event: SiftEvent) =>
  (event.dates && event.dates.length > 1) ||
  (!!event.endDate && event.endDate !== event.startDate);

export default function SaveEventSheet({
  event,
  currentListName,
  onClose,
  onSaved,
}: SaveEventSheetProps) {
  const needsDatePick = isMultiDate(event);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    needsDatePick ? null : event.startDate
  );

  if (needsDatePick && selectedDate === null) {
    return (
      <GoingDateSheet
        event={event}
        confirmLabel="Next →"
        onConfirm={(date) => setSelectedDate(date)}
        onCancel={onClose}
      />
    );
  }

  return (
    <SaveToListSheet
      eventId={event.id}
      eventMeta={{
        title: event.title,
        startDate: selectedDate ?? event.startDate,
        endDate: event.endDate,
        location: event.location,
      }}
      currentListName={currentListName}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
