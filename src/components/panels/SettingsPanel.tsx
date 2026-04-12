// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Settings Panel - Unified API Manager v2
 * Provider-based API configuration with multi-key support
 * Based on AionUi's ModelModalContent pattern
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  isVisibleImageHostProvider,
  useAPIConfigStore,
  type IProvider,
  type ImageHostProvider,
  type AIFeature,
} from "@/stores/api-config-store";
import { useAppSettingsStore } from "@/stores/app-settings-store";
import { useProjectStore } from "@/stores/project-store";
import { useCharacterLibraryStore } from "@/stores/character-library-store";
import { useSceneStore } from "@/stores/scene-store";
import { useMediaStore } from "@/stores/media-store";
import { getApiKeyCount, parseApiKeys, maskApiKey } from "@/lib/api-key-manager";
import { AddProviderDialog, EditProviderDialog, FeatureBindingPanel } from "@/components/api-manager";
import { AddImageHostDialog } from "@/components/image-host-manager/AddImageHostDialog";
import { EditImageHostDialog } from "@/components/image-host-manager/EditImageHostDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Settings,
  Key,
  Plus,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Shield,
  Check,
  X,
  Loader2,
  MessageSquare,
  Zap,
  ScanEye,
  Info,
  Image,
  RotateCcw,
  Link2,
  Play,
  ShieldAlert,
  Layers,
  Folder,
  HardDrive,
  Download,
  RefreshCw,
  Upload,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { uploadToImageHost } from "@/lib/image-host";
import { UpdateDialog } from "@/components/UpdateDialog";
import type { AvailableUpdateInfo } from "@/types/update";
import packageJson from "../../../package.json";

// Platform icon mapping
const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  memefast: <Zap className="h-5 w-5" />,
  runninghub: <Image className="h-5 w-5" />,
  custom: <Settings className="h-5 w-5" />,
};

export function SettingsPanel() {
  const {
    providers,
    concurrency,
    advancedOptions,
    imageHostProviders,
    addProvider,
    updateProvider,
    removeProvider,
    addImageHostProvider,
    updateImageHostProvider,
    removeImageHostProvider,
    setConcurrency,
    setAdvancedOption,
    resetAdvancedOptions,
    isImageHostConfigured,
    syncProviderModels,
    setFeatureBindings,
    getFeatureBindings,
  } = useAPIConfigStore();
  const {
    resourceSharing,
    storagePaths,
    cacheSettings,
    updateSettings,
    setResourceSharing,
    setStoragePaths,
    setCacheSettings,
    setUpdateSettings,
  } = useAppSettingsStore();
  const { activeProjectId } = useProjectStore();
  const { assignProjectToUnscoped: assignCharactersToProject } = useCharacterLibraryStore();
  const { assignProjectToUnscoped: assignScenesToProject } = useSceneStore();
  const { assignProjectToUnscoped: assignMediaToProject } = useMediaStore();

  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<IProvider | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, boolean | null>>({});
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const [imageHostAddOpen, setImageHostAddOpen] = useState(false);
  const [imageHostEditOpen, setImageHostEditOpen] = useState(false);
  const [editingImageHost, setEditingImageHost] = useState<ImageHostProvider | null>(null);
  const [testingImageHostId, setTestingImageHostId] = useState<string | null>(null);
  const [cacheSize, setCacheSize] = useState(0);
  const [isCacheLoading, setIsCacheLoading] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdateInfo | null>(null);
  const [appVersion, setAppVersion] = useState(packageJson.version);
  const visibleImageHostProviders = useMemo(
    () => imageHostProviders.filter(isVisibleImageHostProvider),
    [imageHostProviders],
  );

  // ====== Memefast 默认绑定自动补全 ======
  // 覆盖场景：
  //  1. 旧版本升级后已有 key 但 featureBindings 为空
  //  2. 旧版本留下无效绑定（模型名错、provider ID 变更等）
  //  3. 用户编辑填 key 后页面刷新
  useEffect(() => {
    const mf = providers.find(p => p.platform === 'memefast');
    if (!mf || parseApiKeys(mf.apiKey).length === 0) return;

    const pid = mf.id;
    const models = mf.model || [];
    const defaults: Record<string, string> = {
      script_analysis: `${pid}:deepseek-v3.2`,
      character_generation: `${pid}:gemini-3-pro-image-preview`,
      video_generation: `${pid}:doubao-seedance-1-5-pro-251215`,
      image_understanding: `${pid}:gemini-2.5-flash`,
    };

    // 检查绑定是否有效
    const isBindingValid = (b: string): boolean => {
      const idx = b.indexOf(':');
      if (idx <= 0) return false;
      const ref = b.slice(0, idx);
      const model = b.slice(idx + 1);
      const p = providers.find(pv => pv.id === ref || pv.platform === ref);
      if (!p || parseApiKeys(p.apiKey).length === 0) return false;
      // 模型列表为空时（尚未同步）暂时信任绑定
      if (p.model.length === 0) return true;
      return p.model.includes(model);
    };

    let changed = false;
    for (const [feature, binding] of Object.entries(defaults)) {
      const cur = getFeatureBindings(feature as AIFeature);

      // 自愈：deepseek-v3 → deepseek-v3.2（在校验之前先迁移）
      if (feature === 'script_analysis' && cur && cur.some(b => b.endsWith(':deepseek-v3'))) {
        const migrated = cur.map(b => {
          if (!b.endsWith(':deepseek-v3')) return b;
          const i = b.indexOf(':');
          return i > 0 ? `${b.slice(0, i)}:deepseek-v3.2` : binding;
        });
        setFeatureBindings(feature as AIFeature, [...new Set(migrated)]);
        changed = true;
        continue;
      }

      // 为空 或 全部无效 → 重新设置默认值
      const needsDefault = !cur || cur.length === 0 || !cur.some(isBindingValid);
      if (needsDefault) {
        setFeatureBindings(feature as AIFeature, [binding]);
        changed = true;
      }
    }
    if (changed) {
      console.log('[SettingsPanel] Auto-applied memefast default bindings');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const version = await window.appUpdater?.getCurrentVersion?.();
        if (!cancelled && version) {
          setAppVersion(version);
        }
      } catch (error) {
        console.warn("[SettingsPanel] Failed to load app version:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Toggle provider expansion
  const toggleExpanded = (id: string) => {
    setExpandedProviders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Open edit dialog
  const handleEdit = (provider: IProvider) => {
    setEditingProvider(provider);
    setEditDialogOpen(true);
  };

  // Delete provider
  const handleDelete = (id: string) => {
    removeProvider(id);
    toast.success("Đã xoá nhà cung cấp");
  };

  const handleEditImageHost = (provider: ImageHostProvider) => {
    setEditingImageHost(provider);
    setImageHostEditOpen(true);
  };

  const handleDeleteImageHost = (id: string) => {
    removeImageHostProvider(id);
    toast.success("Đã xoá host ảnh");
  };

  const handleTestImageHost = async (provider: ImageHostProvider) => {
    setTestingImageHostId(provider.id);
    try {
      const testImage = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      const result = await uploadToImageHost(testImage, {
        expiration: 60,
        providerId: provider.id,
      });
      if (result.success) {
        toast.success(`Kiểm tra kết nối host ảnh ${provider.name} thành công`);
      } else {
        toast.error(`Kiểm tra thất bại: ${result.error || 'Lỗi không xác định'}`);
      }
    } catch (error) {
      toast.error('Kiểm tra kết nối thất bại, vui lòng kiểm tra mạng');
    } finally {
      setTestingImageHostId(null);
    }
  };

  // Test connection - directly call external APIs
  const testConnection = async (provider: IProvider) => {
    const keys = parseApiKeys(provider.apiKey);
    if (keys.length === 0) {
      toast.error("Vui lòng cấu hình API Key trước");
      return;
    }

    setTestingProvider(provider.id);
    setTestResults((prev) => ({ ...prev, [provider.id]: null }));

    try {
      let response: Response;
      const apiKey = keys[0]; // Use first key for test
      const normalizedBaseUrl = provider.baseUrl?.replace(/\/+$/, "");
      const buildEndpoint = (root: string, path: string) => {
        const normalized = root.replace(/\/+$/, "");
        return /\/v\d+$/.test(normalized) ? `${normalized}/${path}` : `${normalized}/v1/${path}`;
      };

      if (provider.platform === "runninghub") {
        if (!normalizedBaseUrl) {
          toast.error("Vui lòng cấu hình Base URL trước");
          setTestingProvider(null);
          return;
        }
        response = await fetch(`${normalizedBaseUrl}/query`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            taskId: "test-connection-check",
          }),
        });
        
        // For RunningHub, 400/404 means auth is OK (task doesn't exist)
        if (response.status === 400 || response.status === 404) {
          setTestResults((prev) => ({ ...prev, [provider.id]: true }));
          toast.success("Kiểm tra kết nối thành công");
          setTestingProvider(null);
          return;
        }
      } else if (normalizedBaseUrl && provider.model?.length) {
        const endpoint = buildEndpoint(normalizedBaseUrl, "chat/completions");
        const model = provider.model[0];
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 5,
          }),
        });
      } else {
        // For providers without chat endpoint info, just mark as configured
        setTestResults((prev) => ({ ...prev, [provider.id]: true }));
        toast.success(`Đã cấu hình ${provider.name}`);
        setTestingProvider(null);
        return;
      }

      const success = response.ok;
      setTestResults((prev) => ({ ...prev, [provider.id]: success }));

      if (success) {
        toast.success("Kiểm tra kết nối thành công");
      } else {
        const errorData = await response.text();
        console.error("API test error:", response.status, errorData);
        toast.error(`Kiểm tra kết nối thất bại (${response.status})`);
      }
    } catch (error) {
      console.error("Connection test error:", error);
      setTestResults((prev) => ({ ...prev, [provider.id]: false }));
      toast.error("Kiểm tra kết nối thất bại, vui lòng kiểm tra mạng");
    } finally {
      setTestingProvider(null);
    }
  };

  // Get existing platforms
  const existingPlatforms = useMemo(
    () => providers.map((p) => p.platform),
    [providers]
  );

  const configuredCount = providers.filter(
    (p) => parseApiKeys(p.apiKey).length > 0
  ).length;

  const [activeTab, setActiveTab] = useState<string>("api");
  const hasStorageManager = typeof window !== "undefined" && !!window.storageManager;
  const hasAppUpdater = typeof window !== "undefined" && !!window.appUpdater;

  const formatBytes = useCallback((bytes: number) => {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(
      units.length - 1,
      Math.floor(Math.log(bytes) / Math.log(1024))
    );
    const value = bytes / Math.pow(1024, index);
    return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[index]}`;
  }, []);

  const refreshCacheSize = useCallback(async () => {
    if (!window.storageManager) return;
    setIsCacheLoading(true);
    try {
      const result = await window.storageManager.getCacheSize();
      setCacheSize(result.total || 0);
    } catch (error) {
      console.error("Failed to get cache size:", error);
    } finally {
      setIsCacheLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasStorageManager) return;
    window.storageManager
      ?.getPaths()
      .then((paths) => {
        if (paths.basePath) {
          setStoragePaths({ basePath: paths.basePath });
        }
      })
      .catch(() => {});
    refreshCacheSize();
  }, [hasStorageManager, refreshCacheSize, setStoragePaths]);

  useEffect(() => {
    if (!hasStorageManager || !window.storageManager) return;
    window.storageManager.updateConfig({
      autoCleanEnabled: cacheSettings.autoCleanEnabled,
      autoCleanDays: cacheSettings.autoCleanDays,
    });
  }, [cacheSettings.autoCleanEnabled, cacheSettings.autoCleanDays, hasStorageManager]);

  const handleToggleShareCharacters = async (checked: boolean) => {
    setResourceSharing({ shareCharacters: checked });
    if (!checked && activeProjectId) {
      assignCharactersToProject(activeProjectId);
    }
    // Rehydrate to load/unload other projects' data
    try { await useCharacterLibraryStore.persist.rehydrate(); } catch {}
  };

  const handleToggleShareScenes = async (checked: boolean) => {
    setResourceSharing({ shareScenes: checked });
    if (!checked && activeProjectId) {
      assignScenesToProject(activeProjectId);
    }
    try { await useSceneStore.persist.rehydrate(); } catch {}
  };

  const handleToggleShareMedia = async (checked: boolean) => {
    setResourceSharing({ shareMedia: checked });
    if (!checked && activeProjectId) {
      assignMediaToProject(activeProjectId);
    }
    try { await useMediaStore.persist.rehydrate(); } catch {}
  };

  // Unified storage handlers
  const handleSelectStoragePath = async () => {
    if (!window.storageManager) {
      toast.error("Vui lòng dùng ứng dụng desktop để sử dụng tính năng này");
      return;
    }
    const dir = await window.storageManager.selectDirectory();
    if (!dir) return;
    const result = await window.storageManager.moveData(dir);
    if (result.success) {
      setStoragePaths({ basePath: result.path || dir });
      
      // 清除 localStorage 中的缓存，确保从新路径加载数据
      const keysToRemove = Object.keys(localStorage).filter(key => 
        key.startsWith('moyin-') || key.includes('store')
      );
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // 清除 IndexedDB 缓存
      try {
        const dbRequest = indexedDB.open('moyin-creator-db', 1);
        dbRequest.onsuccess = () => {
          const db = dbRequest.result;
          if (db.objectStoreNames.contains('zustand-storage')) {
            const tx = db.transaction('zustand-storage', 'readwrite');
            tx.objectStore('zustand-storage').clear();
          }
        };
      } catch (e) {
        console.warn('Failed to clear IndexedDB:', e);
      }
      
      toast.success("Đã cập nhật vị trí lưu trữ, đang làm mới...");
      setTimeout(() => window.location.reload(), 500);
    } else {
      toast.error(`Di chuyển thất bại: ${result.error || "Lỗi không xác định"}`);
    }
  };

  const handleExportData = async () => {
    if (!window.storageManager) return;
    const dir = await window.storageManager.selectDirectory();
    if (!dir) return;
    const result = await window.storageManager.exportData(dir);
    if (result.success) {
      toast.success("Đã xuất dữ liệu");
    } else {
      toast.error(`Xuất thất bại: ${result.error || "Lỗi không xác định"}`);
    }
  };

  const handleImportData = async () => {
    if (!window.storageManager) return;
    const dir = await window.storageManager.selectDirectory();
    if (!dir) return;
    if (!confirm("Nhập dữ liệu sẽ ghi đè dữ liệu hiện tại, tiếp tục?")) return;
    const result = await window.storageManager.importData(dir);
    if (result.success) {
      // 清除 localStorage 中的缓存，防止旧数据覆盖导入的数据
      const keysToRemove = Object.keys(localStorage).filter(key => 
        key.startsWith('moyin-') || key.includes('store')
      );
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // 清除 IndexedDB 缓存
      try {
        const dbRequest = indexedDB.open('moyin-creator-db', 1);
        dbRequest.onsuccess = () => {
          const db = dbRequest.result;
          if (db.objectStoreNames.contains('zustand-storage')) {
            const tx = db.transaction('zustand-storage', 'readwrite');
            tx.objectStore('zustand-storage').clear();
          }
        };
      } catch (e) {
        console.warn('Failed to clear IndexedDB:', e);
      }
      
      toast.success("Đã nhập dữ liệu, đang làm mới...");
      // 延迟刷新页面以确保缓存清理完成
      setTimeout(() => window.location.reload(), 500);
    } else {
      toast.error(`Nhập thất bại: ${result.error || "Lỗi không xác định"}`);
    }
  };

  const handleLinkData = async () => {
    if (!window.storageManager) {
      toast.error("Vui lòng dùng ứng dụng desktop để sử dụng tính năng này");
      return;
    }
    const dir = await window.storageManager.selectDirectory();
    if (!dir) return;
    
    // Validate the directory first
    const validation = await window.storageManager.validateDataDir(dir);
    if (!validation.valid) {
      toast.error(validation.error || "Thư mục dữ liệu không hợp lệ");
      return;
    }
    
    // Confirm with user
    const confirmMsg = `Phát hiện ${validation.projectCount || 0} tệp dự án, ${validation.mediaCount || 0} tệp tư liệu.\n\nBạn có muốn trỏ đến thư mục này? Nên khởi động lại ứng dụng sau thao tác.`;
    if (!confirm(confirmMsg)) return;
    
    const result = await window.storageManager.linkData(dir);
    if (result.success) {
      setStoragePaths({ basePath: result.path || dir });
      
      // 清除 localStorage 中的缓存，确保从新路径加载数据
      const keysToRemove = Object.keys(localStorage).filter(key => 
        key.startsWith('moyin-') || key.includes('store')
      );
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // 清除 IndexedDB 缓存
      try {
        const dbRequest = indexedDB.open('moyin-creator-db', 1);
        dbRequest.onsuccess = () => {
          const db = dbRequest.result;
          if (db.objectStoreNames.contains('zustand-storage')) {
            const tx = db.transaction('zustand-storage', 'readwrite');
            tx.objectStore('zustand-storage').clear();
          }
        };
      } catch (e) {
        console.warn('Failed to clear IndexedDB:', e);
      }
      
      toast.success("Đã trỏ đến thư mục dữ liệu, đang làm mới...");
      setTimeout(() => window.location.reload(), 500);
    } else {
      toast.error(`Thao tác thất bại: ${result.error || "Lỗi không xác định"}`);
    }
  };

  const handleClearCache = async () => {
    if (!window.storageManager) return;
    setIsClearingCache(true);
    try {
      const result = await window.storageManager.clearCache();
      if (result.success) {
        toast.success("Đã dọn cache");
        refreshCacheSize();
      } else {
        toast.error(`Dọn dẹp thất bại: ${result.error || "Lỗi không xác định"}`);
      }
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleCheckForUpdates = async () => {
    if (!window.appUpdater) {
      toast.error("Vui lòng dùng ứng dụng desktop để sử dụng tính năng này");
      return;
    }

    setIsCheckingForUpdates(true);
    try {
      const result = await window.appUpdater.checkForUpdates();
      if (!result.success) {
        toast.error(`Kiểm tra cập nhật thất bại: ${result.error || "Lỗi không xác định"}`);
        return;
      }

      if (result.hasUpdate && result.update) {
        setAvailableUpdate(result.update);
        setUpdateDialogOpen(true);
        return;
      }

      setAvailableUpdate(null);
      toast.success(`Bạn đang dùng phiên bản mới nhất v${result.currentVersion}`);
    } catch (error) {
      console.error("[SettingsPanel] Failed to check updates:", error);
      toast.error("Kiểm tra cập nhật thất bại, vui lòng thử lại sau");
    } finally {
      setIsCheckingForUpdates(false);
    }
  };

  const handleClearIgnoredVersion = () => {
    setUpdateSettings({ ignoredVersion: "" });
    toast.success("Đã khôi phục nhắc cập nhật");
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-border bg-panel px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-3">
            <Settings className="w-5 h-5 text-primary" />
            Cài đặt
          </h2>
        </div>
        {activeTab === "api" && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-mono bg-muted border border-border px-2 py-1 rounded">
              Đã cấu hình: {configuredCount}/{providers.length}
            </span>
            <Button onClick={() => setAddDialogOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Thêm nhà cung cấp
            </Button>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border px-6">
          <TabsList className="h-12 bg-transparent p-0 gap-4">
            <TabsTrigger 
              value="api" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 h-12"
            >
              <Key className="h-4 w-4 mr-2" />
              Quản lý API
            </TabsTrigger>
            <TabsTrigger
              value="advanced"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 h-12"
            >
              <Layers className="h-4 w-4 mr-2" />
              Tuỳ chọn nâng cao
            </TabsTrigger>
            <TabsTrigger
              value="imagehost"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 h-12"
            >
              <Upload className="h-4 w-4 mr-2" />
              Cấu hình Host ảnh
              {isImageHostConfigured() && (
                <span className="ml-1 w-2 h-2 bg-green-500 rounded-full" />
              )}
            </TabsTrigger>
            <TabsTrigger
              value="storage"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 h-12"
            >
              <HardDrive className="h-4 w-4 mr-2" />
              Lưu trữ
            </TabsTrigger>
          </TabsList>
        </div>

        {/* API Management Tab */}
        <TabsContent value="api" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="p-8 max-w-5xl mx-auto space-y-8">
          {/* Security Notice */}
          <div className="flex items-start gap-3 p-4 bg-muted/50 border border-border rounded-lg">
            <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h3 className="font-medium text-foreground text-sm">Thông tin bảo mật</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Tất cả API Key chỉ lưu trữ trong trình duyệt của bạn, không gửi lên bất kỳ máy chủ nào. Hỗ trợ nhiều Key luân phiên, tự động chuyển đổi khi thất bại.
              </p>
            </div>
          </div>

          {/* MemeFast 购买引导 */}
          <a
            href="https://memefast.top"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 bg-gradient-to-r from-orange-500/5 to-primary/5 border border-orange-500/20 rounded-lg hover:border-orange-500/40 transition-colors group"
          >
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500 shrink-0">
              <Zap className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-foreground text-sm flex items-center gap-2">
                Moyin API
                <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded">
                  Khuyên dùng
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Truy cập 543+ mô hình AI một điểm, hỗ trợ GPT / Claude / Gemini / DeepSeek / Sora v.v.
              </p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-primary group-hover:underline">
              Lấy API Key
              <ExternalLink className="h-3.5 w-3.5" />
            </span>
          </a>

          {/* Feature Binding */}
          <FeatureBindingPanel />

          {/* Provider List */}
          <div className="space-y-4">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <Key className="h-4 w-4" />
              Nhà cung cấp API
            </h3>

            {providers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-xl">
                <Info className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  Chưa cấu hình nhà cung cấp nào
                </h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Khuyến nghị dùng Moyin API, hỗ trợ 543+ mô hình một điểm
                </p>
                <a
                  href="https://memefast.top"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-4"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Đến Moyin API lấy Key
                </a>
                <Button onClick={() => setAddDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Thêm nhà cung cấp
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {providers.map((provider) => {
                  const isExpanded = expandedProviders[provider.id] ?? false;
                  const keyCount = getApiKeyCount(provider.apiKey);
                  const configured = keyCount > 0;
                  const testResult = testResults[provider.id];
                  const isTesting = testingProvider === provider.id;

                  return (
                    <Collapsible
                      key={provider.id}
                      open={isExpanded}
                      onOpenChange={() => toggleExpanded(provider.id)}
                    >
                      <div
                        className={cn(
                          "border rounded-xl transition-all",
                          configured
                            ? "bg-card border-primary/30"
                            : "bg-card border-border"
                        )}
                      >
                        {/* Header */}
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center justify-between p-4 hover:bg-muted/30 rounded-t-xl transition-colors">
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  "p-2 rounded-lg",
                                  configured
                                    ? "bg-primary/10 text-primary"
                                    : "bg-muted text-muted-foreground"
                                )}
                              >
                                {PLATFORM_ICONS[provider.platform] || (
                                  <Settings className="h-5 w-5" />
                                )}
                              </div>
                              <div className="text-left">
                                <h4 className="font-medium text-foreground flex items-center gap-2">
                                  {provider.name}
                                  {provider.platform === 'memefast' && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded font-normal">
                                      Khuyên dùng
                                    </span>
                                  )}
                                  {configured && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-normal">
                                      Đã cấu hình
                                    </span>
                                  )}
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                  {provider.platform}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span
                                  className="cursor-pointer hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleExpanded(provider.id);
                                  }}
                                >
                                  Mô hình ({provider.model.length})
                                </span>
                                <span>|</span>
                                <span
                                  className="cursor-pointer hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEdit(provider);
                                  }}
                                >
                                  Key ({keyCount})
                                </span>
                              </div>

                              <div
                                className="flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Đồng bộ danh sách mô hình"
                                  onClick={async () => {
                                    setSyncingProvider(provider.id);
                                    const result = await syncProviderModels(provider.id);
                                    setSyncingProvider(null);
                                    if (result.success) {
                                      toast.success(`Đã đồng bộ ${result.count} mô hình`);
                                    } else {
                                      toast.error(result.error || 'Đồng bộ thất bại');
                                    }
                                  }}
                                  disabled={!configured || syncingProvider === provider.id}
                                >
                                  {syncingProvider === provider.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4" />
                                  )}
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Kiểm tra kết nối"
                                  onClick={() => testConnection(provider)}
                                  disabled={!configured || isTesting}
                                >
                                  {isTesting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : testResult === true ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : testResult === false ? (
                                    <X className="h-4 w-4 text-red-500" />
                                  ) : (
                                    <Shield className="h-4 w-4" />
                                  )}
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Sửa"
                                  onClick={() => handleEdit(provider)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        Xác nhận xoá
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Bạn có chắc muốn xoá {provider.name}? Thao tác này không thể hoàn tác.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Huỷ</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDelete(provider.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Xoá
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>

                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                        </CollapsibleTrigger>

                        {/* MemeFast 购买引导 */}
                        {provider.platform === 'memefast' && !configured && (
                          <div className="px-4 pb-2">
                            <a
                              href="https://memefast.top"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Đến Moyin API lấy Key →
                            </a>
                          </div>
                        )}

                        {/* Expandable Content */}
                        <CollapsibleContent>
                          <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                            {/* Base URL */}
                            {provider.baseUrl && (
                              <div className="text-xs">
                                <span className="text-muted-foreground">
                                  Base URL:{" "}
                                </span>
                                <span className="font-mono text-foreground">
                                  {provider.baseUrl}
                                </span>
                              </div>
                            )}

                            {/* Models */}
                            {provider.model.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {provider.model.map((m) => (
                                  <span
                                    key={m}
                                    className="text-xs px-2 py-1 bg-muted rounded font-mono"
                                  >
                                    {m}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* API Key Preview */}
                            {configured && (
                              <div className="text-xs">
                                <span className="text-muted-foreground">
                                  API Key:{" "}
                                </span>
                                <span className="font-mono text-foreground">
                                  {maskApiKey(parseApiKeys(provider.apiKey)[0])}
                                  {keyCount > 1 && (
                                    <span className="text-muted-foreground">
                                      {" "}
                                      (+{keyCount - 1})
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </div>

          {/* Global Settings */}
          <div className="p-6 border border-border rounded-xl bg-card space-y-6">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Cài đặt chung
            </h3>

            {/* Concurrency */}
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">Số tác vụ đồng thời</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  value={concurrency}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (val >= 1) setConcurrency(val);
                  }}
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground">
                  Số tác vụ tạo đồng thời (khi có nhiều Key có thể đặt cao hơn, khuyến nghị không vượt quá số Key)
                </span>
              </div>
            </div>
          </div>

              {/* About */}
              <div className="text-center py-8 text-muted-foreground border-t border-border">
                <p className="text-sm font-medium">Moyin Creator</p>
                <p className="text-xs mt-1">v{appVersion} · Công cụ tạo video hoạt hình do AI hỗ trợ</p>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Advanced Options Tab */}
        <TabsContent value="advanced" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="p-8 max-w-3xl mx-auto space-y-8">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Layers className="h-5 w-5" />
                    Tuỳ chọn tạo nâng cao
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Các tuỳ chọn này ảnh hưởng đến hành vi tạo video trong mô-đun Đạo diễn AI
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    resetAdvancedOptions();
                    toast.success("Đã khôi phục cài đặt mặc định");
                  }}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Mặc định
                </Button>
              </div>

              {/* Options List */}
              <div className="space-y-4">
                {/* Visual Continuity */}
                <div className="p-4 border border-border rounded-xl bg-card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary mt-0.5">
                        <Link2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-medium text-foreground">Tính liên tục thị giác</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Tự động truyền khung cuối của phân cảnh trước làm ảnh tham chiếu cho phân cảnh sau, giữ nhất quán phong cách và ngoại hình nhân vật
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Khuyến nghị bật · Phù hợp với truyện liên tục và video dài
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={advancedOptions.enableVisualContinuity}
                      onCheckedChange={(checked) => setAdvancedOption('enableVisualContinuity', checked)}
                    />
                  </div>
                </div>

                {/* Resume Generation */}
                <div className="p-4 border border-border rounded-xl bg-card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary mt-0.5">
                        <Play className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-medium text-foreground">Tiếp tục khi gián đoạn</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Khi tạo hàng loạt bị gián đoạn có thể tiếp tục từ vị trí cuối, không cần bắt đầu lại
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Khuyến nghị bật · Tránh mất tiến độ do gián đoạn mạng hoặc API hết giờ
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={advancedOptions.enableResumeGeneration}
                      onCheckedChange={(checked) => setAdvancedOption('enableResumeGeneration', checked)}
                    />
                  </div>
                </div>

                {/* Content Moderation */}
                <div className="p-4 border border-border rounded-xl bg-card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary mt-0.5">
                        <ShieldAlert className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-medium text-foreground">Dung sai kiểm duyệt nội dung</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Tự động bỏ qua phân cảnh khi gặp nội dung nhạy cảm, tiếp tục tạo phân cảnh khác
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Khuyến nghị bật · Tránh một phân cảnh lỗi gây gián đoạn toàn bộ quy trình
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={advancedOptions.enableContentModeration}
                      onCheckedChange={(checked) => setAdvancedOption('enableContentModeration', checked)}
                    />
                  </div>
                </div>

                {/* Auto Model Switch */}
                <div className="p-4 border border-border rounded-xl bg-card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-muted text-muted-foreground mt-0.5">
                        <Zap className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-medium text-foreground">Tự động chuyển đổi mô hình</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Phân cảnh đầu dùng text-to-video (t2v), các phân cảnh sau dùng image-to-video (i2v)
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Mặc định tắt · Cần cấu hình nhiều mô hình để sử dụng
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={advancedOptions.enableAutoModelSwitch}
                      onCheckedChange={(checked) => setAdvancedOption('enableAutoModelSwitch', checked)}
                    />
                  </div>
                </div>
              </div>

              {/* Info Notice */}
              <div className="flex items-start gap-3 p-4 bg-muted/50 border border-border rounded-lg">
                <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Các tuỳ chọn này sẽ ảnh hưởng đến hành vi tạo video của mô-đun Đạo diễn AI. Nếu không chắc chắn, nên giữ mặc định.
                  </p>
                </div>
              </div>

              {/* About */}
              <div className="text-center py-8 text-muted-foreground border-t border-border">
                <p className="text-sm font-medium">Moyin Creator</p>
                <p className="text-xs mt-1">v{appVersion} · Công cụ tạo video hoạt hình do AI hỗ trợ</p>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Image Host Config Tab */}
        <TabsContent value="imagehost" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="p-8 max-w-3xl mx-auto space-y-8">
              {/* Header */}
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Cấu hình Host ảnh
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Host ảnh dùng để lưu ảnh tạm trong quá trình tạo video (ví dụ: trích khung cuối, truyền khung, v.v.)
                </p>
              </div>

              {/* Image Host Providers */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Nhà cung cấp host ảnh</Label>
                  <Button size="sm" variant="outline" onClick={() => setImageHostAddOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Thêm
                  </Button>
                </div>

                {visibleImageHostProviders.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Chưa cấu hình host ảnh</div>
                ) : (
                  <div className="space-y-3">
                    {visibleImageHostProviders.map((provider) => {
                      const keyCount = getApiKeyCount(provider.apiKey);
                      const endpoint = provider.uploadPath || provider.baseUrl;
                      const configured = provider.enabled && !!endpoint && (provider.apiKeyOptional || keyCount > 0);
                      return (
                        <div key={provider.id} className="p-4 border border-border rounded-xl bg-card space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">{provider.name}</span>
                                {configured ? (
                                  <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-500 rounded">
                                    Đã cấu hình
                                  </span>
                                ) : (
                                  <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded">
                                    Chưa cấu hình
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {provider.platform} · {endpoint || 'Chưa đặt địa chỉ'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {provider.apiKeyOptional && keyCount === 0
                                  ? "Tải lên không cần Key"
                                  : `${keyCount} Key`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={provider.enabled}
                                onCheckedChange={(checked) =>
                                  updateImageHostProvider({ ...provider, enabled: checked })
                                }
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!provider.enabled || testingImageHostId === provider.id}
                              onClick={() => handleTestImageHost(provider)}
                            >
                              {testingImageHostId === provider.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Kiểm tra kết nối"
                              )}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleEditImageHost(provider)}>
                              Sửa
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteImageHost(provider.id)}>
                              Xoá
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Info Notice */}
              <div className="flex items-start gap-3 p-4 bg-muted/50 border border-border rounded-lg">
                <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Host ảnh dùng để lưu ảnh tạm trong quá trình tạo video, chủ yếu cho tính năng "Tính liên tục thị giác".
                    Nếu không cấu hình host ảnh, tính năng truyền khung giữa các phân cảnh sẽ bị hạn chế.
                    Khi bật nhiều host, hệ thống sẽ dùng luân phiên, tự chuyển khi thất bại.
                  </p>
                  <p className="text-sm">
                    Mặc định đã bật host SCDN, không cần nhập KEY;
                    ImgBB mặc định tắt, nếu cần dùng vui lòng tự bật và kiểm tra khả dụng.
                  </p>
                </div>
              </div>

              {/* About */}
              <div className="text-center py-8 text-muted-foreground border-t border-border">
                <p className="text-sm font-medium">Moyin Creator</p>
                <p className="text-xs mt-1">v{appVersion} · Công cụ tạo video hoạt hình do AI hỗ trợ</p>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Storage Tab */}
        <TabsContent value="storage" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="p-8 max-w-3xl mx-auto space-y-8">
              {/* Header */}
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <HardDrive className="h-5 w-5" />
                  Cài đặt lưu trữ
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Cài đặt chiến lược chia sẻ tài nguyên, vị trí lưu trữ và quản lý cache
                </p>
              </div>

              {!hasStorageManager && (
                <div className="flex items-start gap-3 p-4 bg-muted/50 border border-border rounded-lg">
                  <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Cài đặt lưu trữ chỉ khả dụng trong bản desktop.
                    </p>
                  </div>
                </div>
              )}

              {/* Resource Sharing */}
              <div className="p-6 border border-border rounded-xl bg-card space-y-4">
                <h4 className="font-medium text-foreground flex items-center gap-2">
                  <Folder className="h-4 w-4" />
                  Chia sẻ tài nguyên
                </h4>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Chia sẻ thư viện nhân vật giữa các dự án</p>
                    <p className="text-xs text-muted-foreground">Khi tắt, chỉ dự án hiện tại thấy được</p>
                  </div>
                  <Switch
                    checked={resourceSharing.shareCharacters}
                    onCheckedChange={handleToggleShareCharacters}
                    disabled={!hasStorageManager}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Chia sẻ thư viện bối cảnh giữa các dự án</p>
                    <p className="text-xs text-muted-foreground">Khi tắt, chỉ dự án hiện tại thấy được</p>
                  </div>
                  <Switch
                    checked={resourceSharing.shareScenes}
                    onCheckedChange={handleToggleShareScenes}
                    disabled={!hasStorageManager}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Chia sẻ thư viện tư liệu giữa các dự án</p>
                    <p className="text-xs text-muted-foreground">Khi tắt, chỉ dự án hiện tại thấy được</p>
                  </div>
                  <Switch
                    checked={resourceSharing.shareMedia}
                    onCheckedChange={handleToggleShareMedia}
                    disabled={!hasStorageManager}
                  />
                </div>
              </div>

              {/* Storage Path - Single unified location */}
              <div className="p-6 border border-border rounded-xl bg-card space-y-5">
                <h4 className="font-medium text-foreground flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Vị trí lưu trữ
                </h4>

                <div className="space-y-3">
                  <Label className="text-xs text-muted-foreground">Vị trí lưu dữ liệu (bao gồm dự án và tư liệu)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={storagePaths.basePath || 'Vị trí mặc định'}
                      placeholder="Vị trí mặc định"
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button size="sm" onClick={handleSelectStoragePath} disabled={!hasStorageManager}>
                      Chọn
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportData} disabled={!hasStorageManager}>
                      <Download className="h-3.5 w-3.5 mr-1" />
                      Xuất
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleImportData} disabled={!hasStorageManager}>
                      Nhập
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  ⚠️ Đổi vị trí sẽ di chuyển dữ liệu hiện tại sang thư mục mới (tự động tạo thư mục con projects/ và media/)
                </p>
              </div>

              {/* Data Recovery - Link to existing data */}
              <div className="p-6 border border-border rounded-xl bg-card space-y-4">
                <h4 className="font-medium text-foreground flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Khôi phục dữ liệu
                </h4>
                <p className="text-sm text-muted-foreground">
                  Sau khi đổi thiết bị hoặc cài lại hệ thống, chỉ cần trỏ đến thư mục dữ liệu cũ để khôi phục mọi cấu hình và dự án
                </p>

                <div className="space-y-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLinkData}
                    disabled={!hasStorageManager}
                    className="w-full"
                  >
                    <Folder className="h-3.5 w-3.5 mr-1" />
                    Trỏ đến thư mục dữ liệu đã có
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    💡 Chọn thư mục dữ liệu có chứa thư mục con projects/ và media/, nên khởi động lại ứng dụng sau thao tác.
                  </p>
                </div>
              </div>

              {/* Cache Management */}
              <div className="p-6 border border-border rounded-xl bg-card space-y-4">
                <h4 className="font-medium text-foreground flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Quản lý cache
                </h4>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Dung lượng cache</p>
                    <p className="text-xs text-muted-foreground">
                      {isCacheLoading ? "Đang tính..." : formatBytes(cacheSize)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={refreshCacheSize}
                      disabled={!hasStorageManager || isCacheLoading}
                    >
                      <RefreshCw className={`h-4 w-4 ${isCacheLoading ? "animate-spin" : ""}`} />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearCache}
                      disabled={!hasStorageManager || isClearingCache}
                    >
                      {isClearingCache ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Dọn dẹp"
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Tự động dọn dẹp</p>
                    <p className="text-xs text-muted-foreground">Mặc định tắt</p>
                  </div>
                  <Switch
                    checked={cacheSettings.autoCleanEnabled}
                    onCheckedChange={(checked) => setCacheSettings({ autoCleanEnabled: checked })}
                    disabled={!hasStorageManager}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Dọn dẹp</Label>
                  <Input
                    type="number"
                    min={1}
                    value={cacheSettings.autoCleanDays}
                    onChange={(e) =>
                      setCacheSettings({ autoCleanDays: Math.max(1, parseInt(e.target.value) || 1) })
                    }
                    className="w-20"
                    disabled={!cacheSettings.autoCleanEnabled}
                  />
                  <span className="text-xs text-muted-foreground">ngày trước cho tệp cache</span>
                </div>
              </div>

              <div className="p-6 border border-border rounded-xl bg-card space-y-5">
                <h4 className="font-medium text-foreground flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Cập nhật ứng dụng
                </h4>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Phiên bản hiện tại</p>
                    <p className="text-xs text-muted-foreground font-mono mt-1">v{appVersion}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCheckForUpdates}
                    disabled={!hasAppUpdater || isCheckingForUpdates}
                  >
                    {isCheckingForUpdates ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    Kiểm tra cập nhật
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Tự động kiểm tra cập nhật khi khởi động</p>
                    <p className="text-xs text-muted-foreground">
                      Khi bật, bản desktop sẽ tự kiểm tra danh sách phiên bản từ xa khi khởi động và nhắc phiên bản mới
                    </p>
                  </div>
                  <Switch
                    checked={updateSettings.autoCheckEnabled}
                    onCheckedChange={(checked) => setUpdateSettings({ autoCheckEnabled: checked })}
                    disabled={!hasAppUpdater}
                  />
                </div>

                {updateSettings.ignoredVersion && (
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">Phiên bản đã bỏ qua</p>
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        v{updateSettings.ignoredVersion}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleClearIgnoredVersion}>
                      Khôi phục nhắc
                    </Button>
                  </div>
                )}

                {!hasAppUpdater && (
                  <p className="text-xs text-muted-foreground">
                    Tính năng này chỉ khả dụng trong bản đóng gói desktop.
                  </p>
                )}
              </div>

              {/* About */}
              <div className="text-center py-8 text-muted-foreground border-t border-border">
                <p className="text-sm font-medium">Moyin Creator</p>
                <p className="text-xs mt-1">v{appVersion} · Công cụ tạo video hoạt hình do AI hỗ trợ</p>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <AddProviderDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSubmit={(providerData) => {
          // 魔因API：已存在时合并 Key，不重复创建
          const existingMemefast = providerData.platform === 'memefast'
            ? providers.find((p) => p.platform === 'memefast')
            : null;
          let provider: IProvider;
          if (existingMemefast) {
            const oldKeys = parseApiKeys(existingMemefast.apiKey);
            const newKeys = parseApiKeys(providerData.apiKey);
            const merged = Array.from(new Set([...oldKeys, ...newKeys]));
            updateProvider({ ...existingMemefast, apiKey: merged.join(',') });
            provider = existingMemefast;
          } else {
            provider = addProvider(providerData);
          }
          // 如果添加的是 memefast 供应商，自动设置默认服务映射（仅在对应服务尚未配置时）
          if (providerData.platform === 'memefast') {
            // 使用 provider.id（而非 platform 字符串）避免多供应商时的歧义解析
            const pid = provider.id;
            const MEMEFAST_DEFAULT_BINDINGS: Record<string, string> = {
              // NOTE: MemeFast 端点已升级，旧的 deepseek-v3 已不在列表中，改用 deepseek-v3.2
              script_analysis: `${pid}:deepseek-v3.2`,
              character_generation: `${pid}:gemini-3-pro-image-preview`,
              video_generation: `${pid}:doubao-seedance-1-5-pro-251215`,
              image_understanding: `${pid}:gemini-2.5-flash`,
            };
            for (const [feature, binding] of Object.entries(MEMEFAST_DEFAULT_BINDINGS)) {
              const current = getFeatureBindings(feature as AIFeature);
              // 仅在未配置时设置默认值，避免覆盖用户手动选择
              if (!current || current.length === 0) {
                setFeatureBindings(feature as AIFeature, [binding]);
                continue;
              }
              // 自愈：旧默认 deepseek-v3 -> deepseek-v3.2（尽量不破坏多选配置）
              if (feature === 'script_analysis') {
                const hasOld = current.some((b) => b.endsWith(':deepseek-v3'));
                if (hasOld) {
                  const migrated = current.map((b) => {
                    if (!b.endsWith(':deepseek-v3')) return b;
                    const idx = b.indexOf(':');
                    if (idx <= 0) return binding;
                    const prefix = b.slice(0, idx);
                    return `${prefix}:deepseek-v3.2`;
                  });
                  const deduped = Array.from(new Set(migrated));
                  setFeatureBindings(feature as AIFeature, deduped);
                }
              }
            }
          }
          // 添加后自动同步模型列表和端点元数据
          const finalProviderId = existingMemefast ? existingMemefast.id : provider.id;
          if (parseApiKeys(providerData.apiKey).length > 0) {
            setSyncingProvider(finalProviderId);
            syncProviderModels(finalProviderId).then(result => {
              setSyncingProvider(null);
              if (result.success) {
                toast.success(`已自动同步 ${result.count} 个模型`);
              } else if (result.error) {
                toast.error(`模型同步失败: ${result.error}`);
              }
            });
          }
        }}
        existingPlatforms={existingPlatforms}
      />

      <EditProviderDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        provider={editingProvider}
        onSave={(provider) => {
          updateProvider(provider);

          // 编辑 memefast 时也自动设置默认服务映射：初始状态会预置一个空 key 的 memefast，
          // 用户通常是“编辑填 key”，如果不在这里补默认映射，会导致服务映射一直是 0/6。
          if (provider.platform === 'memefast' && parseApiKeys(provider.apiKey).length > 0) {
            const pid = provider.id;
            const MEMEFAST_DEFAULT_BINDINGS: Record<string, string> = {
              // NOTE: MemeFast 端点已升级，旧的 deepseek-v3 已不在列表中，改用 deepseek-v3.2
              script_analysis: `${pid}:deepseek-v3.2`,
              character_generation: `${pid}:gemini-3-pro-image-preview`,
              video_generation: `${pid}:doubao-seedance-1-5-pro-251215`,
              image_understanding: `${pid}:gemini-2.5-flash`,
            };
            for (const [feature, binding] of Object.entries(MEMEFAST_DEFAULT_BINDINGS)) {
              const current = getFeatureBindings(feature as AIFeature);
              if (!current || current.length === 0) {
                setFeatureBindings(feature as AIFeature, [binding]);
                continue;
              }
              // 自愈：旧默认 deepseek-v3 -> deepseek-v3.2
              if (feature === 'script_analysis') {
                const hasOld = current.some((b) => b.endsWith(':deepseek-v3'));
                if (hasOld) {
                  const migrated = current.map((b) => {
                    if (!b.endsWith(':deepseek-v3')) return b;
                    const idx = b.indexOf(':');
                    if (idx <= 0) return binding;
                    const prefix = b.slice(0, idx);
                    return `${prefix}:deepseek-v3.2`;
                  });
                  const deduped = Array.from(new Set(migrated));
                  setFeatureBindings(feature as AIFeature, deduped);
                }
              }
            }
          }
          // 编辑保存后自动同步模型列表和端点元数据
          if (parseApiKeys(provider.apiKey).length > 0) {
            setSyncingProvider(provider.id);
            syncProviderModels(provider.id).then(result => {
              setSyncingProvider(null);
              if (result.success) {
                toast.success(`已自动同步 ${result.count} 个模型`);
              } else if (result.error) {
                toast.error(`模型同步失败: ${result.error}`);
              }
            });
          }
        }}
      />

      <AddImageHostDialog
        open={imageHostAddOpen}
        onOpenChange={setImageHostAddOpen}
        onSubmit={addImageHostProvider}
      />

      <EditImageHostDialog
        open={imageHostEditOpen}
        onOpenChange={setImageHostEditOpen}
        provider={editingImageHost}
        onSave={updateImageHostProvider}
      />
      <UpdateDialog
        open={updateDialogOpen}
        onOpenChange={setUpdateDialogOpen}
        updateInfo={availableUpdate}
        onIgnoreVersion={(version) => {
          setUpdateSettings({ ignoredVersion: version });
          setAvailableUpdate(null);
        }}
      />
    </div>
  );
}
