import i18n from "./index";

/** Locale-aware renderer formatting. Keep persisted values and API payloads locale-neutral. */
export function formatDate(value: Date | number, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat(i18n.language, options).format(value);
}

export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat(i18n.language, options).format(value);
}

export function formatList(values: string[]) {
  type ListFormatter = { format: (items: string[]) => string };
  type IntlWithListFormat = typeof Intl & { ListFormat?: new (locale: string, options: { style: "long"; type: "conjunction" }) => ListFormatter };
  const ListFormat = (Intl as IntlWithListFormat).ListFormat;
  return ListFormat ? new ListFormat(i18n.language, { style: "long", type: "conjunction" }).format(values) : values.join(", ");
}

export function formatRelativeTime(value: number, unit: Intl.RelativeTimeFormatUnit) {
  return new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" }).format(value, unit);
}

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (!minutes) return i18n.t("format.seconds", { count: remainder });
  if (!remainder) return i18n.t("format.minutes", { count: minutes });
  return i18n.t("format.duration", { minutes, seconds: remainder });
}

export function formatFileSize(bytes: number) {
  if (!bytes) return `0 ${i18n.t("format.bytes")}`;
  const units = ["bytes", "kilobytes", "megabytes", "gigabytes", "terabytes"] as const;
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return i18n.t(`format.${units[index]}`, { value: formatNumber(bytes / 1024 ** index, { maximumFractionDigits: 2 }) });
}
