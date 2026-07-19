package com.gruahub.shared.infra;

import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;

@ApplicationScoped
public class RateLimitService {

    private final ConcurrentHashMap<String, Deque<Long>> buckets = new ConcurrentHashMap<>();

    public boolean tryAcquire(String key, int maxRequests, long windowSeconds) {
        if (maxRequests <= 0) {
            return false;
        }
        long now = Instant.now().getEpochSecond();
        long cutoff = now - windowSeconds;
        Deque<Long> bucket = buckets.computeIfAbsent(key, k -> new ArrayDeque<>());

        synchronized (bucket) {
            while (!bucket.isEmpty() && bucket.peekFirst() <= cutoff) {
                bucket.pollFirst();
            }
            if (bucket.size() >= maxRequests) {
                return false;
            }
            bucket.addLast(now);
            return true;
        }
    }
}
