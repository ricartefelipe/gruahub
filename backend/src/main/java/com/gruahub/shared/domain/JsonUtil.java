package com.gruahub.shared.domain;

/**
 * Utilitário para construção segura de JSON simples.
 * Evita injeção de JSON via concatenação de strings.
 * Não usa ObjectMapper para evitar dependência pesada em classes utilitárias
 * chamadas em contextos de auditoria (REQUIRES_NEW).
 */
public final class JsonUtil {

    private JsonUtil() {}

    /**
     * Escapa uma string para uso seguro dentro de valor JSON.
     * Cobre os caracteres que, se não escapados, poderiam encerrar o valor
     * prematuramente ou injetar campos adicionais.
     */
    public static String escape(String value) {
        if (value == null) return null;
        return value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t");
    }

    /** Objeto com um campo string. */
    public static String obj(String key, String value) {
        if (value == null) {
            return "{\"" + escape(key) + "\":null}";
        }
        return "{\"" + escape(key) + "\":\"" + escape(value) + "\"}";
    }

    /** Objeto com dois campos string. */
    public static String obj(String k1, String v1, String k2, String v2) {
        return "{\"" + escape(k1) + "\":\"" + escape(v1) + "\","
             + "\"" + escape(k2) + "\":\"" + escape(v2) + "\"}";
    }

    /** Objeto com três campos string. */
    public static String obj(String k1, String v1, String k2, String v2, String k3, String v3) {
        return "{\"" + escape(k1) + "\":\"" + escape(v1) + "\","
             + "\"" + escape(k2) + "\":\"" + escape(v2) + "\","
             + "\"" + escape(k3) + "\":\"" + escape(v3) + "\"}";
    }

    /** Objeto com um campo string e um campo long (sem aspas no valor). */
    public static String obj(String stringKey, String stringValue, String longKey, long longValue) {
        return "{\"" + escape(stringKey) + "\":\"" + escape(stringValue) + "\","
             + "\"" + escape(longKey) + "\":" + longValue + "}";
    }

    /** Objeto com um campo string e um campo boolean. */
    public static String objStringBool(String stringKey, String stringValue,
                                       String boolKey, boolean boolValue) {
        return "{\"" + escape(stringKey) + "\":\"" + escape(stringValue) + "\","
             + "\"" + escape(boolKey) + "\":" + boolValue + "}";
    }

    /** Constrói um array de objetos {key,checked} escapado para checklist. */
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

    /** Interface mínima para itens de checklist. */
    public interface ChecklistEntry {
        String key();
        boolean checked();
    }
}
