// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  IMAGE_HOST_PRESETS,
  type ImageHostProvider,
  type ImageHostPlatform,
} from "@/stores/api-config-store";

interface EditImageHostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: ImageHostProvider | null;
  onSave: (provider: ImageHostProvider) => void;
}

export function EditImageHostDialog({
  open,
  onOpenChange,
  provider,
  onSave,
}: EditImageHostDialogProps) {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState<ImageHostPlatform>("scdn");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [uploadPath, setUploadPath] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [apiKeyParam, setApiKeyParam] = useState("");
  const [apiKeyHeader, setApiKeyHeader] = useState("");
  const [apiKeyFormField, setApiKeyFormField] = useState("");
  const [apiKeyOptional, setApiKeyOptional] = useState(false);
  const [expirationParam, setExpirationParam] = useState("");
  const [imageField, setImageField] = useState("");
  const [imagePayloadType, setImagePayloadType] = useState<ImageHostProvider["imagePayloadType"]>("base64");
  const [nameField, setNameField] = useState("");
  const [staticFormFields, setStaticFormFields] = useState<Record<string, string> | undefined>(undefined);
  const [responseUrlField, setResponseUrlField] = useState("");
  const [responseDeleteUrlField, setResponseDeleteUrlField] = useState("");
  const apiKeyLabel = platform === "imgurl"
    ? t("上传 Tokens")
    : platform === "scdn"
      ? t("API Key（无需填写）")
    : platform === "catbox"
      ? t("Userhash（可选）")
      : t("API Keys");
  const apiKeyRequiredMessage = platform === "imgurl" ? t("请输入上传 Token") : t("请输入 API Key");
  const apiKeyPlaceholder = platform === "imgurl"
    ? t("输入上传 Token / Authorization 值（每行一个；如需 Bearer，请手动填写完整值）")
    : platform === "scdn"
      ? t("留空即可，SCDN 支持直接上传")
    : platform === "catbox"
      ? t("可留空匿名上传；如需绑定到 Catbox 账号，请填写 userhash")
    : t("输入 API Keys（每行一个，或用逗号分隔）");

  useEffect(() => {
    if (provider) {
      setPlatform(provider.platform);
      setName(provider.name || "");
      setBaseUrl(provider.baseUrl || "");
      setUploadPath(provider.uploadPath || "");
      setApiKey(provider.apiKey || "");
      setEnabled(provider.enabled ?? true);
      setApiKeyParam(provider.apiKeyParam || "");
      setApiKeyHeader(provider.apiKeyHeader || "");
      setApiKeyFormField(provider.apiKeyFormField || "");
      setApiKeyOptional(provider.apiKeyOptional ?? false);
      setExpirationParam(provider.expirationParam || "");
      setImageField(provider.imageField || "");
      setImagePayloadType(provider.imagePayloadType || "base64");
      setNameField(provider.nameField || "");
      setStaticFormFields(provider.staticFormFields);
      setResponseUrlField(provider.responseUrlField || "");
      setResponseDeleteUrlField(provider.responseDeleteUrlField || "");
    }
  }, [provider]);

  const handlePlatformChange = (value: string) => {
    const nextPlatform = value as ImageHostPlatform;
    const preset = IMAGE_HOST_PRESETS.find((item) => item.platform === nextPlatform);
    setPlatform(nextPlatform);
    if (!preset) return;
    setName(preset.name || "");
    setBaseUrl(preset.baseUrl || "");
    setUploadPath(preset.uploadPath || "");
    setEnabled(preset.enabled ?? true);
    setApiKeyParam(preset.apiKeyParam || "");
    setApiKeyHeader(preset.apiKeyHeader || "");
    setApiKeyFormField(preset.apiKeyFormField || "");
    setApiKeyOptional(preset.apiKeyOptional ?? false);
    setExpirationParam(preset.expirationParam || "");
    setImageField(preset.imageField || "");
    setImagePayloadType(preset.imagePayloadType || "base64");
    setNameField(preset.nameField || "");
    setStaticFormFields(preset.staticFormFields);
    setResponseUrlField(preset.responseUrlField || "");
    setResponseDeleteUrlField(preset.responseDeleteUrlField || "");
  };

  const handleSave = () => {
    if (!provider) return;
    if (!name.trim()) {
      toast.error(t("请输入名称"));
      return;
    }
    if (!baseUrl.trim() && !uploadPath.trim()) {
      toast.error(t("请配置 Base URL 或 Upload Path"));
      return;
    }
    if (!apiKey.trim() && !apiKeyOptional) {
      toast.error(apiKeyRequiredMessage);
      return;
    }

    onSave({
      ...provider,
      platform,
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      uploadPath: uploadPath.trim(),
      apiKey: apiKey.trim(),
      enabled,
      apiKeyParam: apiKeyParam.trim() || undefined,
      apiKeyHeader: apiKeyHeader.trim() || undefined,
      apiKeyFormField: apiKeyFormField.trim() || undefined,
      apiKeyOptional,
      expirationParam: expirationParam.trim() || undefined,
      imageField: imageField.trim() || undefined,
      imagePayloadType,
      nameField: nameField.trim() || undefined,
      staticFormFields,
      responseUrlField: responseUrlField.trim() || undefined,
      responseDeleteUrlField: responseDeleteUrlField.trim() || undefined,
    });

    onOpenChange(false);
    toast.success(t("已保存更改"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("编辑图床服务商")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="space-y-2">
            <Label>{t("平台")}</Label>
            <Select value={platform} onValueChange={handlePlatformChange}>
              <SelectTrigger>
                <SelectValue placeholder={t("选择平台")} />
              </SelectTrigger>
              <SelectContent>
                {IMAGE_HOST_PRESETS.map((preset) => (
                  <SelectItem key={preset.platform} value={preset.platform}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("名称")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("图床名称")} />
          </div>

          <div className="space-y-2">
            <Label>Base URL</Label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" />
          </div>

          <div className="space-y-2">
            <Label>Upload Path / URL</Label>
            <Input value={uploadPath} onChange={(e) => setUploadPath(e.target.value)} placeholder={t("/upload 或完整 URL")} />
          </div>

          <div className="space-y-2">
            <Label>{apiKeyLabel}</Label>
            <Textarea
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={apiKeyPlaceholder}
              className="font-mono text-sm min-h-[80px]"
            />
            {platform === "imgbb" && (
              <p className="text-xs text-red-500">
                ImgBB 当前可用性存在问题，默认保持关闭；建议优先切换到 Catbox。
              </p>
            )}
            {platform === "imgurl" && (
              <p className="text-xs text-muted-foreground">
                使用 ImgURL / Zpic 开放接口里的上传 Token（V3），支持多 Token 轮换。
              </p>
            )}
            {platform === "scdn" && (
              <p className="text-xs text-muted-foreground">
                SCDN 图床支持直接上传，当前更适合作为默认图床使用。
              </p>
            )}
            {platform === "catbox" && (
              <p className="text-xs text-muted-foreground">
                Catbox 为海外图床；如果当前网络连不上，建议改用 SCDN 图床或自定义图床。
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label>{t("启用")}</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">{t("高级配置（可选）")}</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("API Key Query 参数")}</Label>
                <Input value={apiKeyParam} onChange={(e) => setApiKeyParam(e.target.value)} placeholder="key" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">API Key Header</Label>
                <Input value={apiKeyHeader} onChange={(e) => setApiKeyHeader(e.target.value)} placeholder="Authorization" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("过期参数")}</Label>
                <Input value={expirationParam} onChange={(e) => setExpirationParam(e.target.value)} placeholder="expiration" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("图片字段名")}</Label>
                <Input value={imageField} onChange={(e) => setImageField(e.target.value)} placeholder="image" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("名称字段名")}</Label>
                <Input value={nameField} onChange={(e) => setNameField(e.target.value)} placeholder="name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("返回 URL 字段")}</Label>
                <Input value={responseUrlField} onChange={(e) => setResponseUrlField(e.target.value)} placeholder="data.url" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("删除 URL 字段")}</Label>
                <Input value={responseDeleteUrlField} onChange={(e) => setResponseDeleteUrlField(e.target.value)} placeholder="data.delete_url" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("取消")}</Button>
          <Button onClick={handleSave}>{t("保存")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
