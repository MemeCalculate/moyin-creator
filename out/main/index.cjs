"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const https = require("node:https");
const http = require("node:http");
const os = require("node:os");
const DEFAULT_STORAGE_CONFIG = {
  basePath: "",
  projectPath: "",
  mediaPath: "",
  autoCleanEnabled: false,
  autoCleanDays: 30
};
const storageConfigPath = path.join(electron.app.getPath("userData"), "storage-config.json");
let storageConfig = loadStorageConfig();
let autoCleanInterval = null;
function mergeStorageConfig(partial) {
  storageConfig = { ...storageConfig, ...partial };
}
function loadStorageConfig() {
  try {
    if (fs.existsSync(storageConfigPath)) {
      const raw = fs.readFileSync(storageConfigPath, "utf-8");
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_STORAGE_CONFIG, ...parsed };
    }
  } catch (error) {
    console.warn("Failed to load storage config:", error);
  }
  return { ...DEFAULT_STORAGE_CONFIG };
}
function saveStorageConfig() {
  try {
    fs.writeFileSync(storageConfigPath, JSON.stringify(storageConfig, null, 2), "utf-8");
  } catch (error) {
    console.warn("Failed to save storage config:", error);
  }
}
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
function normalizePath(inputPath) {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(inputPath);
}
function isSubdirectory(parentPath, childPath) {
  const normalizedParent = path.resolve(parentPath).toLowerCase() + path.sep;
  const normalizedChild = path.resolve(childPath).toLowerCase() + path.sep;
  return normalizedChild.startsWith(normalizedParent);
}
function pathsConflict(source, dest) {
  const normalizedSource = path.resolve(source).toLowerCase();
  const normalizedDest = path.resolve(dest).toLowerCase();
  if (normalizedSource === normalizedDest) {
    return null;
  }
  if (isSubdirectory(source, dest)) {
    return "目标路径不能是当前路径的子目录";
  }
  if (isSubdirectory(dest, source)) {
    return "当前路径不能是目标路径的子目录";
  }
  return null;
}
function getStorageBasePath() {
  const configured = storageConfig.basePath?.trim();
  if (configured) {
    return normalizePath(configured);
  }
  const legacyProject = storageConfig.projectPath?.trim();
  if (legacyProject) {
    return path.dirname(normalizePath(legacyProject));
  }
  return electron.app.getPath("userData");
}
function getProjectDataRoot() {
  const base = path.join(getStorageBasePath(), "projects");
  ensureDir(base);
  return base;
}
function getMediaRoot() {
  const base = path.join(getStorageBasePath(), "media");
  ensureDir(base);
  return base;
}
function getCacheDirs() {
  const userData = electron.app.getPath("userData");
  return [
    path.join(userData, "Cache"),
    path.join(userData, "Code Cache"),
    path.join(userData, "GPUCache")
  ];
}
function getImagesDir(subDir) {
  const imagesDir = path.join(getMediaRoot(), subDir);
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  return imagesDir;
}
function getDataDir() {
  const dataDir = getProjectDataRoot();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}
async function getDirectorySize(dirPath) {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await getDirectorySize(fullPath);
      } else {
        const stat = await fs.promises.stat(fullPath);
        total += stat.size;
      }
    }
    return total;
  } catch {
    return 0;
  }
}
async function copyDir(source, destination) {
  ensureDir(destination);
  await fs.promises.cp(source, destination, { recursive: true, force: true });
}
async function removeDir(dirPath) {
  await fs.promises.rm(dirPath, { recursive: true, force: true });
}
async function deleteOldFiles(dirPath, cutoffTime) {
  let cleared = 0;
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        cleared += await deleteOldFiles(fullPath, cutoffTime);
        const remaining = await fs.promises.readdir(fullPath);
        if (remaining.length === 0) {
          await fs.promises.rmdir(fullPath).catch(() => {
          });
        }
      } else {
        const stat = await fs.promises.stat(fullPath);
        if (stat.mtimeMs < cutoffTime) {
          await fs.promises.unlink(fullPath).catch(() => {
          });
          cleared += stat.size;
        }
      }
    }
  } catch {
  }
  return cleared;
}
async function clearCache(olderThanDays) {
  const dirs = getCacheDirs();
  let cleared = 0;
  if (olderThanDays && olderThanDays > 0) {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1e3;
    for (const dir of dirs) {
      cleared += await deleteOldFiles(dir, cutoff);
    }
    return cleared;
  }
  for (const dir of dirs) {
    cleared += await getDirectorySize(dir);
    await removeDir(dir).catch(() => {
    });
    ensureDir(dir);
  }
  return cleared;
}
function scheduleAutoClean() {
  if (autoCleanInterval) {
    clearInterval(autoCleanInterval);
    autoCleanInterval = null;
  }
  if (storageConfig.autoCleanEnabled) {
    const days = storageConfig.autoCleanDays || DEFAULT_STORAGE_CONFIG.autoCleanDays;
    clearCache(days).catch(() => {
    });
    autoCleanInterval = setInterval(() => {
      clearCache(days).catch(() => {
      });
    }, 24 * 60 * 60 * 1e3);
  }
}
function downloadImage(url, filePath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(filePath);
    proto.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadImage(redirectUrl, filePath).then(resolve).catch(reject);
          return;
        }
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      fs.unlink(filePath, () => {
      });
      reject(err);
    });
  });
}
function register$2() {
  electron.ipcMain.handle("save-image", async (_event, { url, category, filename }) => {
    try {
      const imagesDir = getImagesDir(category);
      const ext = path.extname(filename) || ".png";
      const safeName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
      const filePath = path.join(imagesDir, safeName);
      if (url.startsWith("data:")) {
        const matches = url.match(/^data:[^;]+;base64,(.+)$/s);
        if (!matches) {
          return { success: false, error: "Invalid data URL format" };
        }
        const buffer = Buffer.from(matches[1], "base64");
        if (buffer.length === 0) {
          return { success: false, error: "Decoded base64 data is empty (0 bytes)" };
        }
        fs.writeFileSync(filePath, buffer);
      } else {
        await downloadImage(url, filePath);
      }
      const stat = fs.statSync(filePath);
      if (stat.size === 0) {
        fs.unlinkSync(filePath);
        return { success: false, error: "Saved file is 0 bytes" };
      }
      return { success: true, localPath: `local-image://${category}/${safeName}` };
    } catch (error) {
      console.error("Failed to save image:", error);
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("get-image-path", async (_event, localPath) => {
    const match = localPath.match(/^local-image:\/\/(.+)\/(.+)$/);
    if (!match) return null;
    const [, category, filename] = match;
    const filePath = path.join(getMediaRoot(), category, filename);
    if (fs.existsSync(filePath)) {
      return `file:///${filePath.replace(/\\/g, "/")}`;
    }
    return null;
  });
  electron.ipcMain.handle("delete-image", async (_event, localPath) => {
    const match = localPath.match(/^local-image:\/\/(.+)\/(.+)$/);
    if (!match) return false;
    const [, category, filename] = match;
    const filePath = path.join(getMediaRoot(), category, filename);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return true;
    } catch {
      return false;
    }
  });
  electron.ipcMain.handle("read-image-base64", async (_event, localPath) => {
    try {
      let filePath;
      const match = localPath.match(/^local-image:\/\/(.+)\/(.+)$/);
      if (match) {
        const [, category, filename] = match;
        filePath = path.join(getMediaRoot(), category, decodeURIComponent(filename));
      } else if (localPath.startsWith("file://")) {
        filePath = localPath.replace("file://", "");
      } else {
        filePath = localPath;
      }
      if (!fs.existsSync(filePath)) {
        return { success: false, error: "File not found" };
      }
      const data = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp"
      };
      const mimeType = mimeTypes[ext] || "image/png";
      const base64 = `data:${mimeType};base64,${data.toString("base64")}`;
      return { success: true, base64, mimeType, size: data.length };
    } catch (error) {
      console.error("Failed to read image:", error);
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("get-absolute-path", async (_event, localPath) => {
    const match = localPath.match(/^local-image:\/\/(.+)\/(.+)$/);
    if (!match) return null;
    const [, category, filename] = match;
    const filePath = path.join(getMediaRoot(), category, decodeURIComponent(filename));
    if (fs.existsSync(filePath)) {
      return filePath;
    }
    return null;
  });
}
function register$1() {
  electron.ipcMain.handle("file-storage-get", async (_event, key) => {
    try {
      const filePath = path.join(getDataDir(), `${key}.json`);
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, "utf-8");
        return data;
      }
      return null;
    } catch (error) {
      console.error("Failed to read file storage:", error);
      return null;
    }
  });
  electron.ipcMain.handle("file-storage-set", async (_event, key, value) => {
    try {
      const filePath = path.join(getDataDir(), `${key}.json`);
      const parentDir = path.dirname(filePath);
      ensureDir(parentDir);
      fs.writeFileSync(filePath, value, "utf-8");
      console.log(`Saved to file: ${filePath} (${Math.round(value.length / 1024)}KB)`);
      return true;
    } catch (error) {
      console.error("Failed to write file storage:", error);
      return false;
    }
  });
  electron.ipcMain.handle("file-storage-remove", async (_event, key) => {
    try {
      const filePath = path.join(getDataDir(), `${key}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return true;
    } catch (error) {
      console.error("Failed to remove file storage:", error);
      return false;
    }
  });
  electron.ipcMain.handle("file-storage-exists", async (_event, key) => {
    try {
      const filePath = path.join(getDataDir(), `${key}.json`);
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  });
  electron.ipcMain.handle("file-storage-list", async (_event, prefix) => {
    try {
      const dirPath = path.join(getDataDir(), prefix);
      if (!fs.existsSync(dirPath)) return [];
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      return entries.filter((e) => e.isFile() && e.name.endsWith(".json")).map((e) => `${prefix}/${e.name.replace(".json", "")}`);
    } catch {
      return [];
    }
  });
  electron.ipcMain.handle("file-storage-remove-dir", async (_event, prefix) => {
    try {
      const dirPath = path.join(getDataDir(), prefix);
      if (fs.existsSync(dirPath)) {
        await fs.promises.rm(dirPath, { recursive: true, force: true });
      }
      return true;
    } catch (error) {
      console.error("Failed to remove directory:", error);
      return false;
    }
  });
}
function register() {
  electron.ipcMain.handle("storage-get-paths", async () => {
    return {
      basePath: getStorageBasePath(),
      projectPath: getProjectDataRoot(),
      mediaPath: getMediaRoot(),
      cachePath: path.join(electron.app.getPath("userData"), "Cache")
    };
  });
  electron.ipcMain.handle("storage-select-directory", async () => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });
  electron.ipcMain.handle("storage-validate-data-dir", async (_event, dirPath) => {
    try {
      if (!dirPath) return { valid: false, error: "路径不能为空" };
      const target = normalizePath(dirPath);
      if (!fs.existsSync(target)) return { valid: false, error: "目录不存在" };
      const projectsDir = path.join(target, "projects");
      const mediaDir = path.join(target, "media");
      let projectCount = 0;
      let mediaCount = 0;
      if (fs.existsSync(projectsDir)) {
        const files = await fs.promises.readdir(projectsDir);
        projectCount = files.filter((f) => f.endsWith(".json")).length;
        const perProjectDir = path.join(projectsDir, "_p");
        if (fs.existsSync(perProjectDir)) {
          const projectDirs = await fs.promises.readdir(perProjectDir, { withFileTypes: true });
          const dirCount = projectDirs.filter((d) => d.isDirectory() && !d.name.startsWith(".")).length;
          if (dirCount > 0) projectCount = Math.max(projectCount, dirCount);
        }
      }
      if (fs.existsSync(mediaDir)) {
        const entries = await fs.promises.readdir(mediaDir);
        mediaCount = entries.length;
      }
      if (projectCount === 0 && mediaCount === 0) {
        return { valid: false, error: "该目录不包含有效的数据（需要 projects/ 或 media/ 子目录）" };
      }
      return { valid: true, projectCount, mediaCount };
    } catch (error) {
      return { valid: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("storage-link-data", async (_event, dirPath) => {
    try {
      if (!dirPath) return { success: false, error: "路径不能为空" };
      const target = normalizePath(dirPath);
      if (!fs.existsSync(target)) return { success: false, error: "目录不存在" };
      const projectsDir = path.join(target, "projects");
      const mediaDir = path.join(target, "media");
      const hasProjects = fs.existsSync(projectsDir);
      const hasMedia = fs.existsSync(mediaDir);
      if (!hasProjects && !hasMedia) {
        return { success: false, error: "该目录不包含有效的数据（需要 projects/ 或 media/ 子目录）" };
      }
      mergeStorageConfig({ basePath: target, projectPath: "", mediaPath: "" });
      saveStorageConfig();
      return { success: true, path: target };
    } catch (error) {
      console.error("Failed to link data:", error);
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("storage-move-data", async (_event, newPath) => {
    try {
      if (!newPath) return { success: false, error: "路径不能为空" };
      const target = normalizePath(newPath);
      const currentBase = getStorageBasePath();
      if (currentBase === target) return { success: true, path: currentBase };
      const conflictError = pathsConflict(currentBase, target);
      if (conflictError) {
        return { success: false, error: conflictError };
      }
      const targetProjectsDir = path.join(target, "projects");
      const targetMediaDir = path.join(target, "media");
      ensureDir(targetProjectsDir);
      ensureDir(targetMediaDir);
      const currentProjectsDir = getProjectDataRoot();
      if (fs.existsSync(currentProjectsDir)) {
        const files = await fs.promises.readdir(currentProjectsDir);
        for (const file of files) {
          const src = path.join(currentProjectsDir, file);
          const dest = path.join(targetProjectsDir, file);
          await fs.promises.cp(src, dest, { recursive: true, force: true });
        }
      }
      const currentMediaDir = getMediaRoot();
      if (fs.existsSync(currentMediaDir)) {
        const files = await fs.promises.readdir(currentMediaDir);
        for (const file of files) {
          const src = path.join(currentMediaDir, file);
          const dest = path.join(targetMediaDir, file);
          await fs.promises.cp(src, dest, { recursive: true, force: true });
        }
      }
      mergeStorageConfig({ basePath: target, projectPath: "", mediaPath: "" });
      saveStorageConfig();
      const userData = electron.app.getPath("userData");
      if (!currentProjectsDir.startsWith(userData)) {
        await removeDir(currentProjectsDir).catch(() => {
        });
      }
      if (!currentMediaDir.startsWith(userData)) {
        await removeDir(currentMediaDir).catch(() => {
        });
      }
      return { success: true, path: target };
    } catch (error) {
      console.error("Failed to move data:", error);
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("storage-export-data", async (_event, targetPath) => {
    try {
      if (!targetPath) return { success: false, error: "路径不能为空" };
      const exportDir = path.join(
        normalizePath(targetPath),
        `moyin-data-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}`
      );
      const exportProjectsDir = path.join(exportDir, "projects");
      const exportMediaDir = path.join(exportDir, "media");
      ensureDir(exportProjectsDir);
      ensureDir(exportMediaDir);
      await copyDir(getProjectDataRoot(), exportProjectsDir);
      await copyDir(getMediaRoot(), exportMediaDir);
      return { success: true, path: exportDir };
    } catch (error) {
      console.error("Failed to export data:", error);
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("storage-import-data", async (_event, sourcePath) => {
    try {
      if (!sourcePath) return { success: false, error: "路径不能为空" };
      const source = normalizePath(sourcePath);
      const sourceProjectsDir = path.join(source, "projects");
      const sourceMediaDir = path.join(source, "media");
      const hasProjects = fs.existsSync(sourceProjectsDir);
      const hasMedia = fs.existsSync(sourceMediaDir);
      if (!hasProjects && !hasMedia) {
        return { success: false, error: "源目录不包含有效数据（需要 projects/ 或 media/ 子目录）" };
      }
      const backupDir = path.join(os.tmpdir(), `moyin-backup-${Date.now()}`);
      const currentProjectsDir = getProjectDataRoot();
      const currentMediaDir = getMediaRoot();
      try {
        if (hasProjects && fs.existsSync(currentProjectsDir)) {
          const files = await fs.promises.readdir(currentProjectsDir);
          if (files.length > 0) {
            await copyDir(currentProjectsDir, path.join(backupDir, "projects"));
          }
        }
        if (hasMedia && fs.existsSync(currentMediaDir)) {
          const files = await fs.promises.readdir(currentMediaDir);
          if (files.length > 0) {
            await copyDir(currentMediaDir, path.join(backupDir, "media"));
          }
        }
        if (hasProjects) {
          await removeDir(currentProjectsDir).catch(() => {
          });
          await copyDir(sourceProjectsDir, currentProjectsDir);
        }
        if (hasMedia) {
          await removeDir(currentMediaDir).catch(() => {
          });
          await copyDir(sourceMediaDir, currentMediaDir);
        }
        const migrationFlagPath = path.join(currentProjectsDir, "_p", "_migrated.json");
        if (fs.existsSync(migrationFlagPath)) {
          fs.unlinkSync(migrationFlagPath);
          console.log("Cleared migration flag for re-evaluation after import");
        }
        await removeDir(backupDir).catch(() => {
        });
        return { success: true };
      } catch (importError) {
        console.error("Import failed, rolling back:", importError);
        const backupProjectsDir = path.join(backupDir, "projects");
        const backupMediaDir = path.join(backupDir, "media");
        if (fs.existsSync(backupProjectsDir)) {
          await removeDir(currentProjectsDir).catch(() => {
          });
          await copyDir(backupProjectsDir, currentProjectsDir).catch(() => {
          });
        }
        if (fs.existsSync(backupMediaDir)) {
          await removeDir(currentMediaDir).catch(() => {
          });
          await copyDir(backupMediaDir, currentMediaDir).catch(() => {
          });
        }
        await removeDir(backupDir).catch(() => {
        });
        throw importError;
      }
    } catch (error) {
      console.error("Failed to import data:", error);
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("storage-validate-project-dir", async (_event, dirPath) => {
    return electron.ipcMain.emit("storage-validate-data-dir", null, dirPath);
  });
  electron.ipcMain.handle("storage-link-project-data", async (_event, dirPath) => {
    const target = normalizePath(dirPath);
    const basePath = path.dirname(target);
    mergeStorageConfig({ basePath, projectPath: "", mediaPath: "" });
    saveStorageConfig();
    return { success: true, path: basePath };
  });
  electron.ipcMain.handle("storage-link-media-data", async (_event, dirPath) => {
    const target = normalizePath(dirPath);
    const basePath = path.dirname(target);
    mergeStorageConfig({ basePath, projectPath: "", mediaPath: "" });
    saveStorageConfig();
    return { success: true, path: basePath };
  });
  electron.ipcMain.handle("storage-move-project-data", async (_event, _newPath) => {
    return { success: false, error: "请使用新的统一存储路径功能" };
  });
  electron.ipcMain.handle("storage-move-media-data", async (_event, _newPath) => {
    return { success: false, error: "请使用新的统一存储路径功能" };
  });
  electron.ipcMain.handle("storage-export-project-data", async (_event, targetPath) => {
    try {
      if (!targetPath) return { success: false, error: "路径不能为空" };
      const exportDir = path.join(
        normalizePath(targetPath),
        `moyin-data-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}`
      );
      ensureDir(path.join(exportDir, "projects"));
      ensureDir(path.join(exportDir, "media"));
      await copyDir(getProjectDataRoot(), path.join(exportDir, "projects"));
      await copyDir(getMediaRoot(), path.join(exportDir, "media"));
      return { success: true, path: exportDir };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("storage-import-project-data", async (_event, sourcePath) => {
    try {
      if (!sourcePath) return { success: false, error: "路径不能为空" };
      const source = normalizePath(sourcePath);
      const projectsDir = path.join(source, "projects");
      const mediaDir = path.join(source, "media");
      if (fs.existsSync(projectsDir)) {
        await removeDir(getProjectDataRoot()).catch(() => {
        });
        await copyDir(projectsDir, getProjectDataRoot());
      } else {
        await removeDir(getProjectDataRoot()).catch(() => {
        });
        await copyDir(source, getProjectDataRoot());
      }
      if (fs.existsSync(mediaDir)) {
        await removeDir(getMediaRoot()).catch(() => {
        });
        await copyDir(mediaDir, getMediaRoot());
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("storage-export-media-data", async (_event, targetPath) => {
    try {
      if (!targetPath) return { success: false, error: "路径不能为空" };
      const exportDir = path.join(
        normalizePath(targetPath),
        `moyin-data-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}`
      );
      ensureDir(path.join(exportDir, "projects"));
      ensureDir(path.join(exportDir, "media"));
      await copyDir(getProjectDataRoot(), path.join(exportDir, "projects"));
      await copyDir(getMediaRoot(), path.join(exportDir, "media"));
      return { success: true, path: exportDir };
    } catch (error) {
      console.error("Failed to export data:", error);
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("storage-import-media-data", async (_event, sourcePath) => {
    try {
      if (!sourcePath) return { success: false, error: "路径不能为空" };
      const target = getMediaRoot();
      const source = normalizePath(sourcePath);
      if (source === target) return { success: true };
      await removeDir(target);
      await copyDir(source, target);
      return { success: true };
    } catch (error) {
      console.error("Failed to import media data:", error);
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("storage-get-cache-size", async () => {
    const dirs = getCacheDirs();
    const details = await Promise.all(
      dirs.map(async (dirPath) => ({
        path: dirPath,
        size: await getDirectorySize(dirPath)
      }))
    );
    const total = details.reduce((sum, item) => sum + item.size, 0);
    return { total, details };
  });
  electron.ipcMain.handle("storage-clear-cache", async (_event, options) => {
    try {
      const clearedBytes = await clearCache(options?.olderThanDays);
      return { success: true, clearedBytes };
    } catch (error) {
      console.error("Failed to clear cache:", error);
      return { success: false, error: String(error) };
    }
  });
  electron.ipcMain.handle("storage-update-config", async (_event, config) => {
    mergeStorageConfig(config);
    saveStorageConfig();
    scheduleAutoClean();
    return true;
  });
  electron.ipcMain.handle("save-file-dialog", async (_event, { localPath, defaultPath, filters }) => {
    try {
      let sourcePath = null;
      const imageMatch = localPath.match(/^local-image:\/\/(.+)\/(.+)$/);
      const videoMatch = localPath.match(/^local-video:\/\/(.+)\/(.+)$/);
      if (imageMatch) {
        const [, category, filename] = imageMatch;
        sourcePath = path.join(getMediaRoot(), category, decodeURIComponent(filename));
      } else if (videoMatch) {
        const [, category, filename] = videoMatch;
        sourcePath = path.join(getMediaRoot(), category, decodeURIComponent(filename));
      } else if (localPath.startsWith("file://")) {
        sourcePath = localPath.replace("file://", "");
      } else {
        sourcePath = localPath;
      }
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        return { success: false, error: "Source file not found" };
      }
      const result = await electron.dialog.showSaveDialog({
        defaultPath,
        filters
      });
      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }
      fs.copyFileSync(sourcePath, result.filePath);
      return { success: true, filePath: result.filePath };
    } catch (error) {
      console.error("Failed to save file:", error);
      return { success: false, error: String(error) };
    }
  });
}
function registerSchemes() {
  electron.protocol.registerSchemesAsPrivileged([{
    scheme: "local-image",
    privileges: {
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  }]);
}
function registerProtocolHandlers() {
  electron.protocol.handle("local-image", async (request) => {
    try {
      const url = new URL(request.url);
      const category = url.hostname;
      const filename = decodeURIComponent(url.pathname.slice(1));
      const filePath = path.join(getMediaRoot(), category, filename);
      const data = fs.readFileSync(filePath);
      const ext = path.extname(filename).toLowerCase();
      const mimeTypes = {
        // Images
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        // Videos
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".mkv": "video/x-matroska"
      };
      const mimeType = mimeTypes[ext] || "application/octet-stream";
      return new Response(data, {
        headers: { "Content-Type": mimeType }
      });
    } catch (error) {
      console.error("Failed to load local image:", error);
      return new Response("Image not found", { status: 404 });
    }
  });
}
process.env.APP_ROOT = path.join(__dirname, "../..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(__dirname);
const RENDERER_DIST = path.join(__dirname, "../renderer");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
function createWindow() {
  win = new electron.BrowserWindow({
    title: "魔因漫创",
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      electron.shell.openExternal(url);
    }
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (VITE_DEV_SERVER_URL && url.startsWith(VITE_DEV_SERVER_URL)) return;
    if (url.startsWith("file://")) return;
    event.preventDefault();
    electron.shell.openExternal(url);
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
register$2();
register$1();
register();
registerSchemes();
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
    win = null;
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
electron.app.whenReady().then(() => {
  scheduleAutoClean();
  registerProtocolHandlers();
  createWindow();
});
exports.MAIN_DIST = MAIN_DIST;
exports.RENDERER_DIST = RENDERER_DIST;
exports.VITE_DEV_SERVER_URL = VITE_DEV_SERVER_URL;
