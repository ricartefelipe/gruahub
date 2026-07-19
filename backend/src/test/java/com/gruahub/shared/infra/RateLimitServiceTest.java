package com.gruahub.shared.infra;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RateLimitServiceTest {

    private RateLimitService rateLimitService;

    @BeforeEach
    void setUp() {
        rateLimitService = new RateLimitService();
    }

    @Test
    void allowsRequestsWithinLimit() {
        for (int i = 0; i < 3; i++) {
            assertThat(rateLimitService.tryAcquire("k", 3, 60)).isTrue();
        }
    }

    @Test
    void blocksWhenLimitExceeded() {
        assertThat(rateLimitService.tryAcquire("k", 2, 60)).isTrue();
        assertThat(rateLimitService.tryAcquire("k", 2, 60)).isTrue();
        assertThat(rateLimitService.tryAcquire("k", 2, 60)).isFalse();
    }

    @Test
    void isolatesBucketsByKey() {
        assertThat(rateLimitService.tryAcquire("a", 1, 60)).isTrue();
        assertThat(rateLimitService.tryAcquire("a", 1, 60)).isFalse();
        assertThat(rateLimitService.tryAcquire("b", 1, 60)).isTrue();
    }

    @Test
    void rejectsNonPositiveMaxRequests() {
        assertThat(rateLimitService.tryAcquire("k", 0, 60)).isFalse();
        assertThat(rateLimitService.tryAcquire("k", -1, 60)).isFalse();
    }
}
