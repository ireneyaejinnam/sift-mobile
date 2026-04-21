import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useUser } from "@/context/UserContext";
import { fetchEventById } from "@/lib/getEvents";
import { events } from "@/data/events";
import type { SiftEvent } from "@/types/event";
import { colors, radius, typography, spacing, shadows } from "@/lib/theme";

export default function SavedListsSection() {
  const router = useRouter();
  const {
    savedEvents,
    removeSavedEvent,
    addCustomList,
    getAllListNames,
  } = useUser();
  const [expandedList, setExpandedList] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [showNewInput, setShowNewInput] = useState(false);
  const [dbEvents, setDbEvents] = useState<SiftEvent[]>([]);

  // Fetch events from Supabase that aren't in hardcoded data
  useEffect(() => {
    const missingIds = savedEvents
      .map((s) => s.eventId)
      .filter((id) => !events.some((e) => e.id === id));
    if (missingIds.length === 0) return;
    Promise.all(missingIds.map((id) => fetchEventById(id))).then((results) => {
      setDbEvents(results.filter((e): e is SiftEvent => e !== null));
    });
  }, [savedEvents]);

  const allEventsPool = [...events, ...dbEvents];

  const listNames = getAllListNames();
  const eventsByList = listNames.map((listName) => ({
    listName,
    items: savedEvents.filter((s) => s.listName === listName),
  }));

  const handleCreateList = () => {
    const trimmed = newListName.trim();
    if (!trimmed) return;
    addCustomList(trimmed);
    setNewListName("");
    setShowNewInput(false);
  };

  return (
    <View style={st.section}>
      <Text style={st.h3}>Saved Lists</Text>
      <View style={{ gap: 12 }}>
        {eventsByList.map(({ listName, items }) => (
          <View key={listName} style={st.card}>
            <Pressable
              onPress={() =>
                setExpandedList(expandedList === listName ? null : listName)
              }
              style={st.listHeader}
            >
              <Text style={st.listName}>{listName}</Text>
              <Text style={st.listCount}>
                {items.length} {items.length === 1 ? "event" : "events"}
              </Text>
            </Pressable>
            {expandedList === listName && (
              <View style={st.expanded}>
                {items.length === 0 ? (
                  <Text style={st.emptyText}>No events saved yet</Text>
                ) : (
                  <View style={{ gap: 10 }}>
                    {items.map((s) => {
                      const ev = allEventsPool.find((e) => e.id === s.eventId);
                      if (!ev) return null;
                      return (
                        <Pressable key={s.eventId} style={st.eventRow} onPress={() => router.push(`/event/${s.eventId}`)}>
                          <View style={{ flex: 1 }}>
                            <Text style={st.eventTitle}>{ev.title}</Text>
                            <Text style={st.eventMeta}>
                              {ev.startDate} · {ev.location}
                            </Text>
                          </View>
                          <Pressable onPress={() => removeSavedEvent(s.eventId)}>
                            <Text style={st.unsave}>Unsave</Text>
                          </Pressable>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </View>
        ))}
      </View>
      {showNewInput ? (
        <View style={st.newRow}>
          <TextInput
            style={st.input}
            value={newListName}
            onChangeText={setNewListName}
            placeholder="List name"
            placeholderTextColor={colors.textMuted}
          />
          <Pressable
            onPress={handleCreateList}
            disabled={!newListName.trim()}
            style={[st.addBtn, !newListName.trim() && { opacity: 0.5 }]}
          >
            <Text style={st.addBtnText}>Add</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setShowNewInput(true)} style={{ marginTop: 12 }}>
          <Text style={st.createText}>Create new list</Text>
        </Pressable>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  section: { marginBottom: 28 },
  h3: { fontSize: 15, fontWeight: "600", color: colors.foreground, marginBottom: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    ...shadows.card,
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  listName: { ...typography.sm, fontWeight: "600", color: colors.foreground },
  listCount: { ...typography.xs, color: colors.textMuted },
  expanded: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  emptyText: { ...typography.sm, color: colors.textSecondary },
  eventRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    backgroundColor: colors.background,
    borderRadius: radius.md,
  },
  eventTitle: { ...typography.sm, fontWeight: "500", color: colors.foreground },
  eventMeta: { ...typography.xs, color: colors.textMuted, marginTop: 2 },
  unsave: { fontSize: 11, color: colors.textMuted },
  newRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  input: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
    color: colors.foreground,
    backgroundColor: colors.white,
  },
  addBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    justifyContent: "center",
  },
  addBtnText: { fontSize: 14, fontWeight: "600", color: colors.white },
  createText: { fontSize: 13, color: colors.primary, fontWeight: "500", marginTop: 10 },
});
