package com.gruahub.iot.domain;

public enum MqttMessageType {
    HEARTBEAT,
    TELEMETRY,
    EVENT,
    STATUS_REPORT,
    COMMAND_ACK,
    PLAY_STARTED,
    PLAY_COMPLETED,
    PLAY_ABORTED,
    PRIZE_DELIVERED,
    CREDIT_RECEIVED,
    ERROR_REPORT
}
