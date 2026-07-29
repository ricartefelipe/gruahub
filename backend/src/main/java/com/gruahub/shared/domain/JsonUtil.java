package com.gruahub.shared.domain;

/** Escape seguro para JSON via concatenação (sem ObjectMapper em contextos REQUIRES_NEW). */
public final class JsonUtil {

    private JsonUtil() {}

    public static String escape(String value) {
        if (value == null) return null;
        return value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t");
    }

    public static String obj(String key, String value) {
        if (value == null) {
            return "{\"" + escape(key) + "\":null}";
        }
        return "{\"" + escape(key) + "\":\"" + escape(value) + "\"}";
    }

    public static String obj(String k1, String v1, String k2, String v2) {
        return "{\"" + escape(k1) + "\":\"" + escape(v1) + "\","
             + "\"" + escape(k2) + "\":\"" + escape(v2) + "\"}";
    }

    public static String obj(String k1, String v1, String k2, String v2, String k3, String v3) {
        return "{\"" + escape(k1) + "\":\"" + escape(v1) + "\","
             + "\"" + escape(k2) + "\":\"" + escape(v2) + "\","
             + "\"" + escape(k3) + "\":\"" + escape(v3) + "\"}";
    }

    public static String obj(String stringKey, String stringValue, String longKey, long longValue) {
        return "{\"" + escape(stringKey) + "\":\"" + escape(stringValue) + "\","
             + "\"" + escape(longKey) + "\":" + longValue + "}";
    }

    public static String objStringBool(String stringKey, String stringValue,
                                       String boolKey, boolean boolValue) {
        return "{\"" + escape(stringKey) + "\":\"" + escape(stringValue) + "\","
             + "\"" + escape(boolKey) + "\":" + boolValue + "}";
    }

    public static String checklistArray(Iterable<? extends ChecklistEntry> items) {
        if (items == null) return "[]";
        var sb = new StringBuilder("[");
        boolean first = true;
        for (ChecklistEntry item : items) {
            if (!first) sb.append(",");
            sb.append("{\"key\":\"").append(escape(item.key())).append("\",")
              .append("\"checked\":").append(item.checked()).append("}");
            first = false;
        }
        return sb.append("]").toString();
    }

    public interface ChecklistEntry {
        String key();
        boolean checked();
    }
}
