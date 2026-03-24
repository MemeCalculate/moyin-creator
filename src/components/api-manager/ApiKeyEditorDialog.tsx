// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * API Key Editor Dialog
 * Supports multiple API keys with individual testing
 * Based on AionUi's ApiKeyEditorModal pattern
 */

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  Trash2,
  Check,
  X,
  Loader2,
  Shield,
  Pencil,
  Save,
} from "lucide-react";

type KeyStatus = "pending" | "testing" | "valid" | "invalid";

interface ApiKeyItem {
  id: string;
  value: string;
  status: KeyStatus;
  editing: boolean;
}

interface ApiKeyEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKeys: string; // Comma-separated API keys
  onSave: (apiKeys: string) => void;
  onTestKey?: (key: string) => Promise<boolean>;
  providerName?: string;
}

export function ApiKeyEditorDialog({
  open,
  onOpenChange,
  apiKeys,
  onSave,
  onTestKey,
  providerName = "API",
}: ApiKeyEditorDialogProps) {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);

  // Initialize keys when dialog opens
  useEffect(() => {
    if (open) {
      const keyList = apiKeys
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      if (keyList.length === 0) {
        setKeys([
          { id: crypto.randomUUID(), value: "", status: "pending", editing: true },
        ]);
      } else {
        setKeys(
          keyList.map((k) => ({
            id: crypto.randomUUID(),
            value: k,
            status: "pending",
            editing: false,
          }))
        );
      }
    }
  }, [open, apiKeys]);

  // Update single key value
  const updateKeyValue = useCallback((id: string, value: string) => {
    setKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, value, status: "pending" } : k))
    );
  }, []);

  // Toggle editing state
  const toggleEditing = useCallback((id: string) => {
    setKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, editing: !k.editing } : k))
    );
  }, []);

  // Delete single key
  const deleteKey = useCallback((id: string) => {
    setKeys((prev) => {
      const filtered = prev.filter((k) => k.id !== id);
      if (filtered.length === 0) {
        return [
          { id: crypto.randomUUID(), value: "", status: "pending", editing: true },
        ];
      }
      return filtered;
    });
  }, []);

  // Test single key core logic
  const executeKeyTest = useCallback(
    async (id: string, value: string) => {
      if (!onTestKey) return;

      setKeys((prev) =>
        prev.map((k) => (k.id === id ? { ...k, status: "testing" } : k))
      );

      try {
        const isValid = await onTestKey(value);
        setKeys((prev) =>
          prev.map((k) =>
            k.id === id ? { ...k, status: isValid ? "valid" : "invalid" } : k
          )
        );
      } catch {
        setKeys((prev) =>
          prev.map((k) => (k.id === id ? { ...k, status: "invalid" } : k))
        );
      }
    },
    [onTestKey]
  );

  // Test single key
  const testKey = useCallback(
    async (id: string) => {
      const key = keys.find((k) => k.id === id);
      if (!key || !key.value.trim()) return;
      await executeKeyTest(id, key.value.trim());
    },
    [keys, executeKeyTest]
  );

  // Add new key input
  const addKey = useCallback(() => {
    setKeys((prev) => [
      ...prev,
      { id: crypto.randomUUID(), value: "", status: "pending", editing: true },
    ]);
  }, []);

  // Test all keys
  const testAllKeys = useCallback(async () => {
    const keysToTest = keys.filter((k) => k.value.trim());
    for (const key of keysToTest) {
      await executeKeyTest(key.id, key.value.trim());
    }
  }, [keys, executeKeyTest]);

  // Delete invalid keys
  const deleteInvalidKeys = useCallback(() => {
    setKeys((prev) => {
      const filtered = prev.filter((k) => k.status !== "invalid");
      if (filtered.length === 0) {
        return [
          { id: crypto.randomUUID(), value: "", status: "pending", editing: true },
        ];
      }
      return filtered;
    });
  }, []);

  // Save
  const handleSave = useCallback(() => {
    const validKeys = keys
      .map((k) => k.value.trim())
      .filter(Boolean)
      .join(",");
    onSave(validKeys);
    onOpenChange(false);
  }, [keys, onSave, onOpenChange]);

  // Check states
  const hasMultipleKeys = keys.filter((k) => k.value.trim()).length > 1;
  const hasTestedKeys = keys.some(
    (k) => k.status === "valid" || k.status === "invalid"
  );
  const hasInvalidKeys = keys.some((k) => k.status === "invalid");

  // Get status icon
  const getStatusIcon = (status: KeyStatus) => {
    switch (status) {
      case "testing":
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case "valid":
        return <Check className="h-4 w-4 text-green-500" />;
      case "invalid":
        return <X className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {providerName} Keys</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* Key list */}
          <ScrollArea className="max-h-[300px]">
            <div className="flex flex-col gap-2 pr-4">
              {keys.map((key) => (
                <div key={key.id} className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      type={key.editing ? "text" : "password"}
                      value={key.value}
                      onChange={(e) => updateKeyValue(key.id, e.target.value)}
                      disabled={!key.editing}
                      placeholder="Enter API Key"
                      className="font-mono text-sm"
                    />
                  </div>

                  {/* Action buttons */}
                  {key.value.trim() && (
                    <div className="flex items-center gap-1 shrink-0">
                      {key.editing ? (
                        // Editing: show save button
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => toggleEditing(key.id)}
                              >
                                <Save className="h-4 w-4 text-green-500" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Save</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        // Not editing: show status + test + edit + delete
                        <>
                          {/* Status icon */}
                          {key.status !== "pending" && (
                            <div className="flex items-center px-1">
                              {getStatusIcon(key.status)}
                            </div>
                          )}

                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => testKey(key.id)}
                                  disabled={key.status === "testing" || !onTestKey}
                                >
                                  <Shield className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Test Key</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => toggleEditing(key.id)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => deleteKey(key.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Bottom action bar */}
          <div className="flex items-center justify-between pt-3 border-t">
            <span className="text-xs text-muted-foreground">
              💡 Support multiple Keys for rotation
            </span>
            <div className="flex items-center gap-2">
              {hasMultipleKeys && (
                <>
                  {hasTestedKeys && hasInvalidKeys && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={deleteInvalidKeys}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete invalid Keys</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  {onTestKey && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={testAllKeys}>
                            <Shield className="h-4 w-4 mr-1" />
                            Test All
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Test all Keys</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </>
              )}

              <Button variant="outline" size="sm" onClick={addKey}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
