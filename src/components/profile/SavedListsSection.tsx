import React, { createRef, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { Pencil, Check, X, GripVertical } from "lucide-react-native";
import { useUser } from "@/context/UserContext";
import { fetchEventById } from "@/lib/getEvents";
import { events } from "@/data/events";
import type { SiftEvent } from "@/types/event";
import { colors, radius, typography } from "@/lib/theme";
import BottomSheet from "@/components/ui/BottomSheet";

type ListItem = { listName: string; count: number };

export default function SavedListsSection() {
  const router = useRouter();
  const {
    savedEvents,
    removeSavedEvent,
    addCustomList,
    renameCustomList,
    deleteCustomList,
    reorderCustomLists,
    getAllListNames,
  } = useUser();
  const [expandedList, setExpandedList] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [renamingList, setRenamingList] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [dbEvents, setDbEvents] = useState<SiftEvent[]>([]);
  const swipeRefs = useRef<Record<string, React.RefObject<SwipeableMethods | null>>>({});

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

  const listItems: ListItem[] = listNames.map((listName) => ({
    listName,
    count: savedEvents.filter((s) => s.listName === listName).length,
  }));

  const handleCreateList = () => {
    const trimmed = newListName.trim();
    if (!trimmed) return;
    addCustomList(trimmed);
    closeCreateSheet();
  };

  const openCreateSheet = () => {
    setNewListName("");
    setShowCreateSheet(true);
  };

  const closeCreateSheet = () => {
    setNewListName("");
    setShowCreateSheet(false);
  };

  const handleRenameConfirm = (oldName: string) => {
    const trimmed = renameInput.trim();
    if (trimmed && trimmed !== oldName && !listNames.includes(trimmed)) {
      renameCustomList(oldName, trimmed);
    }
    setRenamingList(null);
  };

  const handleDelete = (listName: string) => {
    swipeRefs.current[listName]?.current?.close();
    deleteCustomList(listName);
    if (expandedList === listName) setExpandedList(null);
  };

  const renderRightActions = (listName: string) => (
    <Pressable onPress={() => handleDelete(listName)} style={st.deleteAction}>
      <Text style={st.deleteActionText}>Delete</Text>
    </Pressable>
  );

  const renderItem = ({ item, drag, isActive }: RenderItemParams<ListItem>) => {
    const { listName, count } = item;
    const isRenaming = renamingList === listName;
    const savedItems = savedEvents.filter((s) => s.listName === listName);

    return (
      <ScaleDecorator>
        <ReanimatedSwipeable
          ref={(() => {
            if (!swipeRefs.current[listName]) swipeRefs.current[listName] = createRef();
            return swipeRefs.current[listName];
          })()}
          friction={2}
          overshootRight={false}
          renderRightActions={() => renderRightActions(listName)}
          enabled={!isActive}
        >
          <View style={[st.card, isActive && st.cardActive]}>
            <View style={st.listHeader}>
              {isRenaming ? (
                <View style={st.renameRow}>
                  <TextInput
                    style={st.renameInput}
                    value={renameInput}
                    onChangeText={setRenameInput}
                    autoFocus
                    autoCapitalize="none"
                    onSubmitEditing={() => handleRenameConfirm(listName)}
                  />
                  <Pressable onPress={() => handleRenameConfirm(listName)} hitSlop={8}>
                    <Check size={15} strokeWidth={2} color={colors.primary} />
                  </Pressable>
                  <Pressable onPress={() => setRenamingList(null)} hitSlop={8}>
                    <X size={15} strokeWidth={2} color={colors.textMuted} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={st.listNameRow}
                  onPress={() => setExpandedList(expandedList === listName ? null : listName)}
                >
                  <View style={st.listNameGroup}>
                    <Text style={st.listName}>{listName}</Text>
                    <Pressable
                      onPress={() => { setRenameInput(listName); setRenamingList(listName); }}
                      hitSlop={8}
                      style={st.pencilBtn}
                    >
                      <Pencil size={13} strokeWidth={1.5} color={colors.textMuted} />
                    </Pressable>
                  </View>
                  <Text style={st.listCount}>{count} {count === 1 ? "event" : "events"}</Text>
                </Pressable>
              )}
              <Pressable onLongPress={drag} delayLongPress={200} style={st.dragHandle} hitSlop={8}>
                <GripVertical size={16} strokeWidth={1.5} color={colors.textMuted} />
              </Pressable>
            </View>

            {expandedList === listName && !isRenaming && (
              <View style={st.expanded}>
                {savedItems.length === 0 ? (
                  <Text style={st.emptyText}>No events saved yet</Text>
                ) : (
                  <View style={{ gap: 10 }}>
                    {savedItems.map((s) => {
                      const ev = allEventsPool.find((e) => e.id === s.eventId);
                      if (!ev) return null;
                      return (
                        <Pressable
                          key={s.eventId}
                          style={st.eventRow}
                          onPress={() => router.push(`/event/${s.eventId}`)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={st.eventTitle}>{ev.title}</Text>
                            <Text style={st.eventMeta}>{ev.startDate} · {ev.location}</Text>
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
        </ReanimatedSwipeable>
      </ScaleDecorator>
    );
  };

  return (
    <View style={st.section}>
      <Text style={st.h3}>Saved Lists</Text>
      <DraggableFlatList
        data={listItems}
        keyExtractor={(item) => item.listName}
        onDragEnd={({ data }) => reorderCustomLists(data.map((d) => d.listName))}
        renderItem={renderItem}
        scrollEnabled={false}
        activationDistance={12}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />

      <Pressable onPress={openCreateSheet} style={st.createTrigger}>
        <Text style={st.createText}>Create new list</Text>
      </Pressable>

      <BottomSheet open={showCreateSheet} onClose={closeCreateSheet} title="Create new list">
        <Text style={st.sheetSubtext}>Add a custom list to organize saved events your way.</Text>
        <View style={st.newRow}>
          <TextInput
            style={st.input}
            value={newListName}
            onChangeText={setNewListName}
            placeholder="List name"
            placeholderTextColor={colors.textMuted}
            autoFocus
            onSubmitEditing={handleCreateList}
          />
        </View>
        <View style={st.sheetActions}>
          <Pressable onPress={closeCreateSheet} style={st.cancelBtn}>
            <Text style={st.cancelBtnText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleCreateList}
            disabled={!newListName.trim()}
            style={[st.addBtn, !newListName.trim() && st.addBtnDisabled]}
          >
            <Text style={st.addBtnText}>Create</Text>
          </Pressable>
        </View>
      </BottomSheet>
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
  cardActive: {
    borderColor: colors.primary,
    opacity: 0.9,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  listNameRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  listNameGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  listName: { ...typography.body, fontWeight: "600", color: colors.foreground },
  pencilBtn: { padding: 2 },
  listCount: { ...typography.sm, color: colors.textSecondary },
  dragHandle: { paddingLeft: 4 },
  renameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  renameInput: {
    flex: 1,
    ...typography.body,
    fontWeight: "600",
    color: colors.foreground,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    padding: 0,
  },
  deleteAction: {
    backgroundColor: colors.pillEndingText,
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: radius.md,
    marginLeft: 8,
  },
  deleteActionText: {
    ...typography.sm,
    fontWeight: "600",
    color: colors.white,
  },
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
  createTrigger: { marginTop: 12 },
  sheetSubtext: {
    ...typography.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 14,
  },
  newRow: { marginTop: 4 },
  input: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.white,
  },
  sheetActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    paddingHorizontal: 18,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44,
  },
  cancelBtnText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  addBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 44,
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { ...typography.body, fontWeight: "600", color: colors.white },
  createText: { ...typography.sm, color: colors.textSecondary },
});
