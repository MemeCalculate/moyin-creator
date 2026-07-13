// Main-process strings used by native dialogs and IPC responses. Keep this catalog
// separate from renderer resources so Electron can show localized native UI before
// any renderer component is mounted.
export type MainLocale = "en" | "zh-CN";

type MessageKey =
  | "appName"
  | "selectDirectory"
  | "saveFile"
  | "allFiles"
  | "imageFiles"
  | "videoFiles"
  | "pathRequired"
  | "directoryNotFound"
  | "invalidDataDirectory"
  | "invalidSourceDirectory"
  | "targetInsideCurrent"
  | "currentInsideTarget"
  | "useUnifiedStorage"
  | "invalidDownloadLink"
  | "sourceFileNotFound"
  | "manifestUrlMissing"
  | "manifestRequestFailed"
  | "manifestVersionMissing"
  | "requestFailed"
  | "requestTimedOut"
  | "imageEmpty"
  | "localImageNotFound"
  | "localImageEmpty"
  | "invalidImageData"
  | "imageHostUrlMissing"
  | "uploadFailed"
  | "uploadSucceededWithoutUrl"
  | "uploadTimedOut"
  | "invalidDataUrl"
  | "emptyDecodedData"
  | "emptySavedFile"
  | "fileNotFound"
  | "operationFailed";

const messages: Record<MainLocale, Record<MessageKey, string>> = {
  "zh-CN": {
    appName: "魔因漫创",
    selectDirectory: "选择数据目录",
    saveFile: "保存文件",
    allFiles: "所有文件",
    imageFiles: "图片文件",
    videoFiles: "视频文件",
    pathRequired: "路径不能为空",
    directoryNotFound: "目录不存在",
    invalidDataDirectory: "该目录不包含有效的数据（需要 projects/ 或 media/ 子目录）",
    invalidSourceDirectory: "源目录不包含有效数据（需要 projects/ 或 media/ 子目录）",
    targetInsideCurrent: "目标路径不能是当前路径的子目录",
    currentInsideTarget: "当前路径不能是目标路径的子目录",
    useUnifiedStorage: "请使用新的统一存储路径功能",
    invalidDownloadLink: "无效下载链接",
    sourceFileNotFound: "源文件未找到",
    manifestUrlMissing: "未配置版本清单地址",
    manifestRequestFailed: "版本清单请求失败（{{status}}）",
    manifestVersionMissing: "版本清单缺少有效的 version 字段",
    requestFailed: "请求失败：{{status}}",
    requestTimedOut: "请求超时（{{seconds}} 秒）",
    imageEmpty: "获取到的图片为空",
    localImageNotFound: "本地图片不存在",
    localImageEmpty: "本地图片为空文件",
    invalidImageData: "图片数据无效",
    imageHostUrlMissing: "图床上传地址未配置",
    uploadFailed: "上传失败",
    uploadSucceededWithoutUrl: "图床 {{provider}} 上传成功但未返回 URL",
    uploadTimedOut: "上传超时，请稍后重试",
    invalidDataUrl: "无效的数据 URL 格式",
    emptyDecodedData: "解码后的数据为空",
    emptySavedFile: "保存的文件为空",
    fileNotFound: "文件未找到",
    operationFailed: "操作失败，请稍后重试",
  },
  en: {
    appName: "Moyin Creator",
    selectDirectory: "Select data directory",
    saveFile: "Save file",
    allFiles: "All files",
    imageFiles: "Image files",
    videoFiles: "Video files",
    pathRequired: "A path is required",
    directoryNotFound: "Directory not found",
    invalidDataDirectory: "This directory does not contain valid data (projects/ or media/ is required)",
    invalidSourceDirectory: "The source directory does not contain valid data (projects/ or media/ is required)",
    targetInsideCurrent: "The destination cannot be inside the current directory",
    currentInsideTarget: "The current directory cannot be inside the destination",
    useUnifiedStorage: "Use the new unified storage location feature",
    invalidDownloadLink: "Invalid download link",
    sourceFileNotFound: "Source file not found",
    manifestUrlMissing: "Update manifest URL is not configured",
    manifestRequestFailed: "Update manifest request failed ({{status}})",
    manifestVersionMissing: "Update manifest has no valid version field",
    requestFailed: "Request failed: {{status}}",
    requestTimedOut: "Request timed out ({{seconds}} seconds)",
    imageEmpty: "The downloaded image is empty",
    localImageNotFound: "Local image not found",
    localImageEmpty: "Local image is empty",
    invalidImageData: "Invalid image data",
    imageHostUrlMissing: "Image host upload URL is not configured",
    uploadFailed: "Upload failed",
    uploadSucceededWithoutUrl: "Image host {{provider}} succeeded but returned no URL",
    uploadTimedOut: "Upload timed out. Please try again.",
    invalidDataUrl: "Invalid data URL format",
    emptyDecodedData: "Decoded data is empty",
    emptySavedFile: "Saved file is empty",
    fileNotFound: "File not found",
    operationFailed: "Operation failed. Please try again.",
  },
};

let activeLocale: MainLocale = "zh-CN";

/** Normalize Chromium/Electron locale tags to the locales shipped by the app. */
export function normalizeMainLocale(locale: unknown): MainLocale {
  if (typeof locale === "string" && locale.replace("_", "-").toLowerCase().startsWith("en")) {
    return "en";
  }
  return "zh-CN";
}

export function setMainLocale(locale: unknown) {
  activeLocale = normalizeMainLocale(locale);
}

export function mainMessage(key: MessageKey, variables: Record<string, string | number> = {}) {
  return messages[activeLocale][key].replace(/{{(\w+)}}/g, (_match, name: string) => String(variables[name] ?? ""));
}

export function localizeFilterName(name: string) {
  if (/^image$/i.test(name)) return mainMessage("imageFiles");
  if (/^video$/i.test(name)) return mainMessage("videoFiles");
  if (/^all files?$/i.test(name)) return mainMessage("allFiles");
  return name;
}
