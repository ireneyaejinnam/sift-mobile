import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useUser } from "@/context/UserContext";
import { events } from "@/data/events";
import { colors, radius, typography, spacing } from "@/lib/theme";

export default function SavedListsSection() {
  const {
    savedEvents,
    removeSavedEvent,
    addCustomList,
    getAllListNames,
  } = useUser();
  const [expandedList, setExpandedList] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [showNewInput, setShowNewInput] = useState(false);

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
                      const ev = events.find((e) => e.id === s.eventId);
                      if (!ev) return null;
                      return (
                        <View key={s.eventId} style={st.eventRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={st.eventTitle}>{ev.title}</Text>
                            <Text style={st.eventMeta}>
                              {ev.startDate} · {ev.location}
                            </Text>
                          </View>
                          <Pressable onPress={() => removeSavedEvent(s.eventId)}>
                            <Text style={st.unsave}>Unsave</Text>
                          </Pressable>
                        </View>
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
  section: { marginBottom: 32 },
  h3: { ...typography.h3, marginBottom: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  listName: { ...typography.body, fontWeight: "600", color: colors.foreground },
  listCount: { ...typography.sm, color: colors.textSecondary },
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
    backgroundColor: colors.muted,
    borderRadius: radius.sm,
  },
  eventTitle: { ...typography.sm, fontWeight: "500", color: colors.foreground },
  eventMeta: { ...typography.xs, color: colors.textSecondary, marginTop: 2 },
  unsave: { ...typography.xs, color: colors.textSecondary },
  newRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.white,
  },
  addBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    justifyContent: "center",
  },
  addBtnText: { ...typography.body, fontWeight: "600", color: colors.white },
  createText: { ...typography.sm, color: colors.textSecondary },
});
