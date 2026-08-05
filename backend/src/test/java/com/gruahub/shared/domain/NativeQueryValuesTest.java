package com.gruahub.shared.domain;

import org.junit.jupiter.api.Test;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NativeQueryValuesTest {

    @Test
    void toInstant_accepts_instant_timestamp_date_and_offset() {
        Instant now = Instant.parse("2026-08-05T12:00:00Z");

        assertThat(NativeQueryValues.toInstant(null)).isNull();
        assertThat(NativeQueryValues.toInstant(now)).isEqualTo(now);
        assertThat(NativeQueryValues.toInstant(Timestamp.from(now))).isEqualTo(now);
        assertThat(NativeQueryValues.toInstant(Date.from(now))).isEqualTo(now);
        assertThat(NativeQueryValues.toInstant(OffsetDateTime.ofInstant(now, ZoneOffset.UTC)))
            .isEqualTo(now);
    }

    @Test
    void toInstant_rejects_unsupported_type() {
        assertThatThrownBy(() -> NativeQueryValues.toInstant("2026-08-05T12:00:00Z"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void toUuid_accepts_uuid_and_string() {
        UUID id = UUID.fromString("11111111-0000-0000-0000-000000000001");
        assertThat(NativeQueryValues.toUuid(null)).isNull();
        assertThat(NativeQueryValues.toUuid(id)).isEqualTo(id);
        assertThat(NativeQueryValues.toUuid(id.toString())).isEqualTo(id);
    }
}
