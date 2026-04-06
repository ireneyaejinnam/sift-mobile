import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useUser } from "@/context/UserContext";
import { colors, radius, spacing, typography } from "@/lib/theme";

interface SaveToListSheetProps {
  eventId: string;
  eventMeta: { title: string; startDate: string; endDate?: string; location?: string };
  currentListName: string | null;
  onClose: () => void;
  onSaved: (listName: string) => void;
}

export default function SaveToListSheet({
  eventId,
  eventMeta,
  currentListName,
  onClose,
  onSaved,
}: SaveToListSheetProps) {
  const { getAllListNames, addSavedEvent, saveEventToNewList } = useUser();
  const [newListName, setNewListName] = useState("");
  const [showNewInput, setShowNewInput] = useState(false);

  const listNames = getAllListNames();

  const handleSelectList = (listName: string) => {
    addSavedEvent(eventId, listName, eventMeta);
    onSaved(listName);
    onClose();
  };

  const handleCreateList = () => {
    const trimmed = newListName.trim();
    if (!trimmed) return;
    saveEventToNewList(trimmed, eventId, eventMeta);
    onSaved(trimmed);
    onClose();
  };

  return (
    <View>
      <Text style={styles.label}>Save to list</Text>
      <View style={styles.list}>
        {listNames.map((name) => (
          <Pressable
            key={name}
            onPress={() => handleSelectList(name)}
            style={[
              styles.option,
              currentListName === name && styles.optionSelected,
            ]}
          >
            <Text style={styles.optionText}>
              {name}
              {currentListName === name ? " ✓" : ""}
            </Text>
          </Pressable>
        ))}
      </View>
      {showNewInput ? (
        <View style={styles.newRow}>
          <TextInput
            style={styles.input}
            value={newListName}
            onChangeText={setNewListName}
            placeholder="List name"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          <Pressable
            onPress={handleCreateList}
            disabled={!newListName.trim()}
            style={[
              styles.addButton,
              !newListName.trim() && { opacity: 0.5 },
            ]}
          >
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => setShowNewInput(true)}
          style={styles.createButton}
        >
          <Text style={styles.createButtonText}>Create new list</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.sm,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  list: {
    gap: 8,
  },
  option: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  optionSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  optionText: {
    ...typography.body,
    color: colors.foreground,
  },
  newRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
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
  addButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    justifyContent: "center",
  },
  addButtonText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.white,
  },
  createButton: {
    marginTop: 16,
    alignItems: "center",
    padding: 12,
  },
  createButtonText: {
    ...typography.sm,
    color: colors.textSecondary,
  },
});
