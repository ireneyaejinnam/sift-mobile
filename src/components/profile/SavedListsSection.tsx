import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
} from "react-native";
import {
  NestableDraggableFlatList,
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { Pencil, Check, X, GripVertical } from "lucide-react-native";
import { useUser } from "@/context/UserContext";
import { fetchEventById } from "@/lib/getEvents";
import { events } from "@/data/events";
import type { SiftEvent } from "@/types/event";
import { colors, radius, typography } from "@/lib/theme";
import BottomSheet from "@/components/ui/BottomSheet";
import EventPlanCard from "@/components/events/EventPlanCard";
import EventDetail from "@/components/events/EventDetail";

type ListItem = { listName: string; count: number };

export default function SavedListsSection() {
  const {
    savedEvents,
    removeSavedEvent,
    addCustomList,
    renameCustomList,
    deleteCustomList,
    reorderCustomLists,
    getAllListNames,
  } = useUser();
  const [listSheetName, setListSheetName] = useState<string | null>(null);
  const [detailEvent, setDetailEvent] = useState<SiftEvent | null>(null);
  const [newListName, setNewListName] = useState("");
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [renamingList, setRenamingList] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [dbEvents, setDbEvents] = useState<SiftEvent[]>([]);
  const detailOpenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (detailOpenTimeoutRef.current) {
        clearTimeout(detailOpenTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const missingIds = savedEvents
      .map((s) => s.eventId)
      .filter((id) => !events.some((e) => e.id === id));
    if (missingIds.length === 0) return;
    Promise.all(missingIds.map((id) => fetchEventById(id))).then((results) => {
      setDbEvents(results.filter((e): e is SiftEvent => e !== null));
    });
  }, [savedEvents]);

  const listNames = getAllListNames();

  const listSheetItems = useMemo<SiftEvent[]>(() => {
    if (!listSheetName) return [];
    const pool = [...events, ...dbEvents];
    return savedEvents
      .filter((s) => s.listName === listSheetName)
      .map((s) => pool.find((e) => e.id === s.eventId))
      .filter((e): e is SiftEvent => e != null);
  }, [listSheetName, savedEvents, dbEvents]);

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
    Keyboard.dismiss();
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
    deleteCustomList(listName);
    if (listSheetName === listName) setListSheetName(null);
  };

  const handleOpenDetail = (event: SiftEvent) => {
    if (detailOpenTimeoutRef.current) {
      clearTimeout(detailOpenTimeoutRef.current);
    }
    setListSheetName(null);
    detailOpenTimeoutRef.current = setTimeout(() => {
      setDetailEvent(event);
      detailOpenTimeoutRef.current = null;
    }, 260);
  };

  const renderRightActions = (listName: string) => (
    <Pressable onPress={() => handleDelete(listName)} style={st.deleteAction}>
      <Text style={st.deleteActionText}>Delete</Text>
    </Pressable>
  );

  const renderItem = ({ item, drag, isActive }: RenderItemParams<ListItem>) => {
    const { listName, count } = item;
    const isRenaming = renamingList === listName;

    return (
      <ScaleDecorator>
        <ReanimatedSwipeable
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
                  onPress={() => setListSheetName(listName)}
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
          </View>
        </ReanimatedSwipeable>
      </ScaleDecorator>
    );
  };

  return (
    <View style={st.section}>
      <Text style={st.h3}>Saved Lists</Text>
      <NestableDraggableFlatList
        data={listItems}
        keyExtractor={(item) => item.listName}
        onDragEnd={({ data }) => reorderCustomLists(data.map((d) => d.listName))}
        renderItem={renderItem}
        activationDistance={12}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />

      <Pressable onPress={openCreateSheet} style={st.createTrigger}>
        <Text style={st.createText}>Create new list</Text>
      </Pressable>

      <Modal
        visible={showCreateSheet}
        transparent
        animationType="fade"
        onRequestClose={closeCreateSheet}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={st.dialogOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <TouchableWithoutFeedback onPress={closeCreateSheet}>
            <View style={st.dialogBackdrop} />
          </TouchableWithoutFeedback>
          <View style={st.dialogCard}>
            <Text style={st.dialogTitle}>Create new list</Text>
            <Text style={st.dialogSubtext}>Add a custom list to organize saved events your way.</Text>
            <TextInput
              style={st.input}
              value={newListName}
              onChangeText={setNewListName}
              placeholder="List name"
              placeholderTextColor={colors.textMuted}
              autoFocus
              onSubmitEditing={handleCreateList}
            />
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
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <BottomSheet
        open={!!listSheetName}
        onClose={() => setListSheetName(null)}
        title={listSheetName ?? undefined}
      >
        <FlatList
          data={listSheetItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <EventPlanCard
              event={item}
              onPress={() => handleOpenDetail(item)}
              onRemove={() => removeSavedEvent(item.id)}
            />
          )}
          style={st.listSheetList}
          contentContainerStyle={st.listSheetContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={st.emptyText}>No events saved yet</Text>
          }
        />
      </BottomSheet>

      {detailEvent && (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setDetailEvent(null)}
        >
          <EventDetail
            event={detailEvent}
            onBack={() => setDetailEvent(null)}
          />
        </Modal>
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
  emptyText: { ...typography.sm, color: colors.textSecondary },
  createTrigger: { marginTop: 12 },
  listSheetList: {
    maxHeight: 480,
  },
  listSheetContent: {
    paddingBottom: 12,
  },
  sheetSubtext: {
    ...typography.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 14,
  },
  dialogOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  dialogBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  dialogCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 20,
  },
  dialogTitle: {
    ...typography.body,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 6,
  },
  dialogSubtext: {
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
